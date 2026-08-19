use anyhow::{anyhow, Result};
use borsh::BorshDeserialize;
use commons::chain::{
    BondingCurve, Pool, PUMPSWAP_PROGRAM_ID, PUMP_PROGRAM_ID, TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
};
use commons::types::TokenContext;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use std::sync::Arc;
use tracing::{debug, warn};

const SOL_MINT: &str = "So11111111111111111111111111111111111111112";

pub struct ProtocolDetector {
    rpc_client: Arc<RpcClient>,
}

impl ProtocolDetector {
    pub fn new(rpc_client: Arc<RpcClient>) -> Self {
        Self { rpc_client }
    }

    pub async fn detect_token_protocol(&self, mint: &Pubkey) -> Result<TokenContext> {
        let pump_fun_program_id = PUMP_PROGRAM_ID.parse::<Pubkey>()?;
        let pumpswap_program_id = PUMPSWAP_PROGRAM_ID.parse::<Pubkey>()?;
        let sol_mint = SOL_MINT.parse::<Pubkey>()?;

        // 1. deterministically derive all potential addresses
        let (bonding_curve, _) =
            Pubkey::find_program_address(&[b"bonding-curve", mint.as_ref()], &pump_fun_program_id);

        let (pool_creator_pda, _) =
            Pubkey::find_program_address(&[b"pool-authority", mint.as_ref()], &pump_fun_program_id);

        let (pool_address, _) = Pubkey::find_program_address(
            &[
                b"pool",
                0_u16.to_le_bytes().as_ref(),
                pool_creator_pda.as_ref(),
                mint.as_ref(),
                sol_mint.as_ref(),
            ],
            &pumpswap_program_id,
        );

        // 2. batch fetch accounts to minimize RPC calls
        let mut retry_count = 0;
        let max_retries = 3;
        let accounts = loop {
            match self
                .rpc_client
                .get_multiple_accounts(&[bonding_curve, pool_address, *mint])
            {
                Ok(accounts) => break accounts,
                Err(e) => {
                    retry_count += 1;
                    if retry_count < max_retries {
                        warn!(
                            "RPC call failed (attempt {}/{}): {}. Retrying...",
                            retry_count, max_retries, e
                        );
                        tokio::time::sleep(tokio::time::Duration::from_secs(
                            2_u64.pow(retry_count as u32),
                        ))
                        .await;
                        continue;
                    } else {
                        return Err(e.into());
                    }
                }
            }
        };

        let bonding_curve_account = &accounts[0];
        let pool_account = &accounts[1];
        let mint_account = &accounts[2];

        // determine token program ID from mint account owner
        let mint_account = mint_account
            .as_ref()
            .ok_or_else(|| anyhow!("mint account {} not found", mint))?;
        let token_program_id = mint_account.owner;

        // validate token program is known
        let token_program_id_str = token_program_id.to_string();
        if token_program_id_str != TOKEN_PROGRAM_ID && token_program_id_str != TOKEN_2022_PROGRAM_ID {
            return Err(anyhow!(
                "mint {} has unknown token program owner: {}",
                mint,
                token_program_id
            ));
        }
        debug!("WE FOUND THE TOKEN PROGRAM OMG token program ID: {}", token_program_id);

        // 3. determine state, prioritizing pumpswap as the terminal state
        if let Some(account) = pool_account {
            // --- CASE 1: POST-MIGRATION OR PUMPSAWP-NATIVE (POOL EXISTS) ---
            debug!("pumpswap pool found; token is on pumpswap");
            let pool_data = Pool::deserialize(&mut &account.data[8..])?;
            debug!("HERE'S THE POOL DATA LOOK FOR MAYHEEEEEEEEEM MAYHEEEEEM MAYHEEEEEM: {:?}", pool_data);

            Ok(TokenContext {
                token_mint: *mint,
                bonding_curve,
                is_migrated: true,
                bonding_curve_creator: None, // Curve account may be closed, can't guarantee this data
                coin_creator: Some(pool_data.coin_creator),
                pool_creator: Some(pool_data.creator),
                pool: Some(pool_address),
                pool_base_token_account: Some(pool_data.pool_base_token_account),
                pool_quote_token_account: Some(pool_data.pool_quote_token_account),
                is_mayhem: pool_data.is_mayhem_mode,
                token_program_id,
            })
        } else if let Some(account) = bonding_curve_account {
            // --- CASE 2: PRE-MIGRATION (BONDING CURVE EXISTS AND POOL DOES NOT) ---
            let bonding_curve_data = BondingCurve::deserialize(&mut &account.data[8..])?;

            if !bonding_curve_data.complete {
                debug!("bonding curve found and is not complete; token is on pump.fun");
                let creator = bonding_curve_data.creator;
                Ok(TokenContext {
                    token_mint: *mint,
                    bonding_curve,
                    is_migrated: false,
                    bonding_curve_creator: Some(creator),
                    coin_creator: Some(creator),
                    pool_creator: Some(pool_creator_pda),
                    pool: Some(pool_address),
                    pool_base_token_account: None,
                    pool_quote_token_account: None,
                    is_mayhem: bonding_curve_data.is_mayhem_mode,
                    token_program_id,
                })
            } else {
                Err(anyhow!(
                    "bonding curve {} is marked complete but canonical pool {} not found for mint {}",
                    bonding_curve,
                    pool_address,
                    mint
                ))
            }
        } else {
            // --- CASE 3: UNKNOWN TOKEN ---
            Err(anyhow!(
                "neither bonding curve {} nor canonical pool {} found for mint {}",
                bonding_curve,
                pool_address,
                mint
            ))
        }
    }
}
