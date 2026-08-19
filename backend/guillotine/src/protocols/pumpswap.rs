use anyhow::Result;
use borsh::BorshDeserialize;
use commons::chain::{GlobalConfig, Pool, TOKEN_PROGRAM_ID};
use commons::contracts::ExecutionOrder;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_instruction, system_program,
};
use spl_associated_token_account::{
    get_associated_token_address as get_ata,
    get_associated_token_address_with_program_id as get_ata_with_program,
    instruction::create_associated_token_account_idempotent as create_ata_idempotent,
};
use std::str::FromStr;
use tracing::{debug, info, warn};

pub const PUMPSWAP_PROGRAM_ID: &str = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
pub const PUMP_FEES_PROGRAM_ID: &str = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
pub const GLOBAL_CONFIG: &str = "ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw";
pub const ASSOCIATED_TOKEN_PROGRAM: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
pub const MAYHEM_FEE_RECIPIENT: &str = "GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS";

// instruction discriminators from IDL
const BUY_DISCRIMINATOR: [u8; 8] = [102, 6, 61, 18, 1, 218, 235, 234];
const SELL_DISCRIMINATOR: [u8; 8] = [51, 230, 133, 164, 1, 127, 131, 173];
const EXTEND_ACCOUNT_DISCRIMINATOR: [u8; 8] = [234, 102, 194, 203, 150, 72, 62, 229];

pub async fn build_pumpswap_instructions(
    command: &ExecutionOrder,
    user_pubkey: &Pubkey,
    rpc_client: &RpcClient,
) -> Result<Vec<solana_sdk::instruction::Instruction>> {
    let pumpswap_program_id = Pubkey::from_str(PUMPSWAP_PROGRAM_ID)?;
    let global_config_pubkey = Pubkey::from_str(GLOBAL_CONFIG)?;
    let wsol_mint = Pubkey::from_str(WSOL_MINT)?;
    let legacy_token_program_id = Pubkey::from_str(TOKEN_PROGRAM_ID)?;
    let token_program_id = command
        .token_program_id
        .unwrap_or_else(|| Pubkey::from_str(TOKEN_PROGRAM_ID).unwrap());
    let associated_token_program = Pubkey::from_str(ASSOCIATED_TOKEN_PROGRAM)?;
    let fee_program_id = Pubkey::from_str(PUMP_FEES_PROGRAM_ID)?;
    let (event_authority, _) =
        Pubkey::find_program_address(&[b"__event_authority"], &pumpswap_program_id);

    /*
     *   PRELIMINARY SETUP
     */

    // create vector to store instructions
    let mut instructions = Vec::new();

    /*
     *   INSTRUCTION: EXTEND ACCOUNT
     *   always add an `extend_account` instruction (idempotent operation)
     */

    let pool_pubkey = command.market_address;

    debug!("adding extend account instruction (idempotent)");

    // the extend_account data is the IDL discriminator
    let mut extend_data = Vec::with_capacity(8);
    extend_data.extend_from_slice(&EXTEND_ACCOUNT_DISCRIMINATOR);

    let extend_instruction = Instruction {
        program_id: pumpswap_program_id,
        accounts: vec![
            AccountMeta::new(pool_pubkey, false),                   // 0
            AccountMeta::new_readonly(*user_pubkey, true),          // 1
            AccountMeta::new_readonly(system_program::id(), false), // 2
            AccountMeta::new_readonly(event_authority, false),      // 3
            AccountMeta::new_readonly(pumpswap_program_id, false),  // 4
        ],
        data: extend_data,
    };

    instructions.push(extend_instruction);
    info!("successfully added `extend account` instruction");

    // ================================================
    // INSTRUCTION:  CREATE WSOL ATA (IDEMPOTENT)
    // ================================================

    let user_wsol_account = get_ata(user_pubkey, &wsol_mint);

    let wsol_ata_instruction = create_ata_idempotent(
        user_pubkey,    // payer
        user_pubkey,    // wallet address
        &wsol_mint,     // mint
        &token_program_id, // token program
    );
    instructions.push(wsol_ata_instruction);
    info!("added `create wsol ATA` instruction");

    // ================================================
    // INSTRUCTION:  TRANSFER SOL TO WSOL
    // ================================================

    let transfer_instruction =
        system_instruction::transfer(user_pubkey, &user_wsol_account, command.sol_amount);
    instructions.push(transfer_instruction);
    info!("added `transfer SOL to WSOL` instruction");

    // ================================================
    // INSTRUCTION:  SYNC WSOL ACCOUNT
    // ================================================

    // sync wrapped SOL account
    let sync_wsol_instruction =
        spl_token::instruction::sync_native(&legacy_token_program_id, &user_wsol_account)?;
    instructions.push(sync_wsol_instruction);
    info!("added `sync WSOL account` instruction");

    if command.is_buy {
        // ================================================
        // INSTRUCTION:  CREATE TOKEN ATA (IDEMPOTENT)
        // ================================================

        // create token account for user
        let token_ata_instruction = create_ata_idempotent(
            user_pubkey,         // payer
            user_pubkey,         // wallet address
            &command.token_mint, // mint
            &token_program_id,   // token program
        );
        instructions.push(token_ata_instruction);
        info!("added `create token ATA` instruction");
    }

    // ================================================
    // INSTRUCTION:  TRADE EVENT & DATA
    // ================================================

    // use cached pool data if available, otherwise deserialize from RPC
    let (coin_creator, pool_base_token_account, pool_quote_token_account) =
        if let (Some(cached_coin_creator), Some(cached_base), Some(cached_quote)) = (
            &command.coin_creator,
            &command.pool_base_token_account,
            &command.pool_quote_token_account,
        ) {
            debug!("using cached pool data from trade");

            (*cached_coin_creator, *cached_base, *cached_quote)
        } else {
            warn!("cached pool data not found in trade; deserializing from RPC...");

            let pool_account = rpc_client.get_account(&pool_pubkey)?;
            let pool_data = Pool::deserialize(&mut &pool_account.data[8..])?;
            (
                pool_data.coin_creator,
                pool_data.pool_base_token_account,
                pool_data.pool_quote_token_account,
            )
        };

    // derive user token ATA address
    let user_token_account = get_ata_with_program(user_pubkey, &command.token_mint, &token_program_id);

    // fetch or use cached GlobalConfig
    let global_config = if let Some(cached_config) = &command.global_config {
        cached_config.clone()
    } else {
        warn!("global_config not found in cache; fetching via RPC...");

        let global_config_account = rpc_client.get_account(&global_config_pubkey)?;
        let global_config = GlobalConfig::deserialize(&mut &global_config_account.data[8..])?;
        global_config
    };

    // determine protocol fee recipient: use hardcoded mayhem fee recipient for mayhem mode, otherwise use regular protocol_fee_recipient
    // Note: reserved_fee_recipient in GlobalConfig may not be set correctly yet, so we use the hardcoded value from docs
    let mayhem_fee_recipient = Pubkey::from_str(MAYHEM_FEE_RECIPIENT)?;
    let protocol_fee_recipient = if command.is_mayhem {
        debug!("OH SHIT MOTHAFUCKA ITS A MAYHEM MODE TOKEN AAWWWWWWW YEAH {}", mayhem_fee_recipient);
        mayhem_fee_recipient
    } else {
        Pubkey::from_str("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV")?
    };

    let protocol_fee_recipient_token_account = if command.is_mayhem {
        global_config.reserved_fee_recipient
    } else {
        get_ata(&protocol_fee_recipient, &wsol_mint)
    };

    debug!(
        protocol_fee_recipient = %protocol_fee_recipient,
        protocol_fee_recipient_token_account = %protocol_fee_recipient_token_account,
        is_mayhem = command.is_mayhem,
        "derived protocol fee recipient addresses"
    );

    // derive coin creator vault addresses (coin_creator already extracted above)
    let (coin_creator_vault_authority, _) = Pubkey::find_program_address(
        &[b"creator_vault", coin_creator.as_ref()],
        &pumpswap_program_id,
    );
    let coin_creator_vault_ata = get_ata(&coin_creator_vault_authority, &wsol_mint);
    debug!(
        coin_creator_vault_authority = %coin_creator_vault_authority,
        coin_creator_vault_ata = %coin_creator_vault_ata,
        "derived coin creator vault addresses"
    );

    // derive accumulator addresses
    let (global_volume_accumulator, _) =
        Pubkey::find_program_address(&[b"global_volume_accumulator"], &pumpswap_program_id);
    let (user_volume_accumulator, _) = Pubkey::find_program_address(
        &[b"user_volume_accumulator", user_pubkey.as_ref()],
        &pumpswap_program_id,
    );
    debug!(
        global_volume_accumulator = %global_volume_accumulator,
        user_volume_accumulator = %user_volume_accumulator,
        "derived accumulator addresses"
    );

    // derive fee config PDA
    let (fee_config_pda, _) = Pubkey::find_program_address(
        &[b"fee_config", pumpswap_program_id.as_ref()],
        &fee_program_id,
    );
    debug!("derived fee config pda: {}", fee_config_pda);

    let mut trade_accounts = vec![
        AccountMeta::new_readonly(pool_pubkey, false), // 0
        AccountMeta::new(*user_pubkey, true),          // 1
        AccountMeta::new_readonly(global_config_pubkey, false), // 2
        AccountMeta::new_readonly(command.token_mint, false), // 3
        AccountMeta::new_readonly(wsol_mint, false),   // 4
        AccountMeta::new(user_token_account, false),   // 5
        AccountMeta::new(user_wsol_account, false),    // 6
        AccountMeta::new(pool_base_token_account, false), // 7
        AccountMeta::new(pool_quote_token_account, false), // 8
        AccountMeta::new_readonly(protocol_fee_recipient, false), // 9
        AccountMeta::new(protocol_fee_recipient_token_account, false), // 10
        AccountMeta::new_readonly(token_program_id, false), // 11
        AccountMeta::new_readonly(token_program_id, false), // 12
        AccountMeta::new_readonly(system_program::id(), false), // 13
        AccountMeta::new_readonly(associated_token_program, false), // 14
        AccountMeta::new_readonly(event_authority, false), // 15
        AccountMeta::new_readonly(pumpswap_program_id, false), // 16
        AccountMeta::new(coin_creator_vault_ata, false), // 17
        AccountMeta::new_readonly(coin_creator_vault_authority, false), // 18
    ];
    debug!("trade instruction account list:");
    for trade_account in trade_accounts.iter() {
        debug!("  {}", trade_account.pubkey);
    }

    // the trade instruction for BUY has two extra accounts
    if command.is_buy {
        trade_accounts.push(AccountMeta::new(global_volume_accumulator, false));
        trade_accounts.push(AccountMeta::new(user_volume_accumulator, false));
    }

    // add the new required fee accounts
    trade_accounts.push(AccountMeta::new_readonly(fee_config_pda, false));
    trade_accounts.push(AccountMeta::new_readonly(fee_program_id, false));

    // create the trade data; start with IDL discriminator
    let mut trade_data = Vec::with_capacity(24);
    trade_data.extend_from_slice(if command.is_buy {
        &BUY_DISCRIMINATOR
    } else {
        &SELL_DISCRIMINATOR
    });

    // then append the encoded token and SOL amounts of the trade
    trade_data.extend_from_slice(&command.token_amount.to_le_bytes());
    trade_data.extend_from_slice(&command.sol_amount.to_le_bytes());
    debug!("encoded trade data: {:?}", trade_data);

    let trade_instruction = Instruction {
        program_id: pumpswap_program_id,
        accounts: trade_accounts,
        data: trade_data,
    };
    instructions.push(trade_instruction);
    info!(
        "successfully added `{}` instruction",
        if command.is_buy { "BUY" } else { "SELL" }
    );

    /*
     *   INSTRUCTION: CLOSE WSOL ACCOUNT
     *   close account and convert the new, wrapped SOL back to native SOL
     */

    let close_wsol_instruction = spl_token::instruction::close_account(
        &token_program_id,
        &user_wsol_account,
        user_pubkey,
        user_pubkey,
        &[],
    )?;
    instructions.push(close_wsol_instruction);
    info!("successfully added `close wSOL account` instruction");

    // return all built instructions in order
    Ok(instructions)
}
