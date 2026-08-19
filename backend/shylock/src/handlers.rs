use crate::Shylock;
use anyhow::{anyhow, Result};
use borsh::BorshDeserialize;
use commons::{
    chain::{BondingCurve, Pool, PumpFunData, PumpSwapData},
    contracts::CachedTokenData,
};
use solana_sdk::pubkey::Pubkey;
use solana_transaction_status::EncodedConfirmedTransactionWithStatusMeta;
use std::sync::Arc;
use tokio::sync::oneshot;
use tracing::debug;

impl Shylock {
    pub(crate) async fn handle_get_live_token_data(
        &self,
        mint: Pubkey,
        reply: oneshot::Sender<Option<Arc<CachedTokenData>>>,
    ) -> Result<()> {
        debug!(mint = %mint, "received request for live token data");

        // this logic has been moved into the main lib.rs file, as it was a shared function
        // used by both the register and the live data fetch commands. a single source of truth
        // is better than two separate implementations.
        let context = if let Some((_, context)) = self.token_subscriptions.read().await.get(&mint) {
            context.clone()
        } else {
            let _ = reply.send(None);
            return Err(anyhow!("token context not found for mint {}", mint));
        };

        let mut cached_data = self
            .token_cache
            .read()
            .await
            .get(&mint)
            .cloned()
            .ok_or_else(|| anyhow!("base cached data not found for mint {}", mint))?;

        if !context.is_migrated {
            let base_pumpfun_data = cached_data
                .pumpfun_data
                .as_ref()
                .ok_or_else(|| anyhow!("missing base pumpfun data in shylock cache"))?;

            let bc_account = self.rpc_client.get_account(&context.bonding_curve)?;
            let bonding_curve = BondingCurve::deserialize(&mut &bc_account.data[8..])?;

            cached_data.pumpfun_data = Some(PumpFunData {
                global_state: base_pumpfun_data.global_state.clone(),
                creator: base_pumpfun_data.creator,
                bonding_curve,
            });
        } else {
            let base_pumpswap_data = cached_data
                .pumpswap_data
                .as_ref()
                .ok_or_else(|| anyhow!("missing base pumpswap data in shylock cache"))?;

            let pool_pk = context
                .pool
                .ok_or_else(|| anyhow!("pool address not found in context for pumpswap token"))?;
            let pool_account = self.rpc_client.get_account(&pool_pk)?;
            let pool_data = Pool::deserialize(&mut &pool_account.data[8..])?;

            let pool_base_reserves = self
                .rpc_client
                .get_token_account_balance(&pool_data.pool_base_token_account)?
                .amount
                .parse::<u64>()?;

            let pool_quote_reserves = self
                .rpc_client
                .get_token_account_balance(&pool_data.pool_quote_token_account)?
                .amount
                .parse::<u64>()?;

            cached_data.pumpswap_data = Some(PumpSwapData {
                coin_creator: base_pumpswap_data.coin_creator,
                pool_base_token_account: pool_data.pool_base_token_account,
                pool_quote_token_account: pool_data.pool_quote_token_account,
                pool_base_reserves,
                pool_quote_reserves,
                global_config: base_pumpswap_data.global_config.clone(),
            });
        }

        let _ = reply.send(Some(Arc::new(cached_data)));
        Ok(())
    }

    pub(crate) async fn handle_get_confirmed_transaction(
        &self,
        signature_str: String,
        reply: oneshot::Sender<Result<EncodedConfirmedTransactionWithStatusMeta>>,
    ) -> Result<()> {
        debug!(signature = %signature_str, "received request for confirmed transaction");
        let signature = signature_str.parse()?;

        let tx_result = self
            .rpc_client
            .get_transaction_with_config(
                &signature,
                solana_client::rpc_config::RpcTransactionConfig {
                    encoding: Some(solana_transaction_status::UiTransactionEncoding::JsonParsed),
                    commitment: Some(solana_sdk::commitment_config::CommitmentConfig::confirmed()),
                    max_supported_transaction_version: Some(0),
                },
            )
            .map_err(|e| e.into());

        let _ = reply.send(tx_result);
        Ok(())
    }
}
