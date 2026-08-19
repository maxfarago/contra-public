use anyhow::Result;
use borsh::BorshDeserialize;
use commons::chain::{BondingCurve, Global, TOKEN_PROGRAM_ID};
use commons::contracts::ExecutionOrder;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
};
use spl_associated_token_account::{
    get_associated_token_address_with_program_id as get_ata_with_program,
    instruction::create_associated_token_account_idempotent as create_ata_idempotent,
};
use std::str::FromStr;
use tracing::{debug, info, warn};

const PUMP_PROGRAM_ID: &str = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMP_FEES_PROGRAM_ID: &str = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
const GLOBAL_ACCOUNT_PUBKEY: &str = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf";
const EVENT_AUTHORITY_PUBKEY: &str = "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1";
const MAYHEM_FEE_RECIPIENT: &str = "GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS";

// instruction discriminators from IDL
const BUY_DISCRIMINATOR: [u8; 8] = [102, 6, 61, 18, 1, 218, 235, 234];
const SELL_DISCRIMINATOR: [u8; 8] = [51, 230, 133, 164, 1, 127, 131, 173];
const EXTEND_ACCOUNT_DISCRIMINATOR: [u8; 8] = [234, 102, 194, 203, 150, 72, 62, 229];

pub async fn build_pumpfun_instructions(
    command: &ExecutionOrder,
    user_pubkey: &Pubkey,
    rpc_client: &RpcClient,
) -> Result<Vec<Instruction>> {
    let pump_program_id = Pubkey::from_str(PUMP_PROGRAM_ID)?;
    let token_program_id = command
        .token_program_id
        .unwrap_or_else(|| Pubkey::from_str(TOKEN_PROGRAM_ID).unwrap());
    let global_pubkey = Pubkey::from_str(GLOBAL_ACCOUNT_PUBKEY)?;
    let event_authority = Pubkey::from_str(EVENT_AUTHORITY_PUBKEY)?;
    let fee_program_id = Pubkey::from_str(PUMP_FEES_PROGRAM_ID)?;

    /*
     *   PRELIMINARY SETUP
     */

    // create vector to store instructions
    let mut instructions = Vec::new();

    // Use cached data if available, otherwise fetch via RPC
    let (global_state, creator) = if let (Some(cached_global), Some(cached_creator)) =
        (&command.global_state, &command.bonding_curve_creator)
    {
        debug!("using cached global state and creator from trade");

        (cached_global.clone(), *cached_creator)
    } else {
        warn!("cached data not found in trade; fetching via RPC...");

        let global_account = rpc_client.get_account(&global_pubkey)?;
        let bonding_curve_pubkey = command.market_address;
        let bonding_curve_account = rpc_client.get_account(&bonding_curve_pubkey)?;

        let global_state = Global::deserialize(&mut &global_account.data[8..])?;
        let bonding_curve = BondingCurve::deserialize(&mut &bonding_curve_account.data[8..])?;
        (global_state, bonding_curve.creator)
    };

    debug!(
        fee_recipient = %global_state.fee_recipient,
        creator = %creator,
        "using global state and creator data",
    );

    /*
     *   INSTRUCTION: EXTEND ACCOUNT
     *   always add an `extend_account` instruction (idempotent operation)
     */

    let bonding_curve_pubkey = command.market_address;

    debug!("adding extend account instruction (idempotent)");

    // the extend_account data is the IDL discriminator
    let mut extend_data = Vec::with_capacity(8);
    extend_data.extend_from_slice(&EXTEND_ACCOUNT_DISCRIMINATOR);

    let extend_instruction = Instruction {
        program_id: pump_program_id,
        accounts: vec![
            AccountMeta::new(bonding_curve_pubkey, false), // 0
            AccountMeta::new_readonly(*user_pubkey, true), // 1
            AccountMeta::new_readonly(system_program::id(), false), // 2
            AccountMeta::new_readonly(event_authority, false), // 3
            AccountMeta::new_readonly(pump_program_id, false), // 4
        ],
        data: extend_data,
    };

    instructions.push(extend_instruction);
    info!("successfully added `extend account` instruction");

    // an ATA needs to be created for the first buy
    if command.is_buy {
        /*
         *   INSTRUCTION: CREATE ASSOCIATED TOKEN ACCOUNT
         *   create an associated token account for the user if it doesn't exist
         */

        let ata_instruction = create_ata_idempotent(
            user_pubkey,         // payer
            user_pubkey,         // wallet address
            &command.token_mint, // mint
            &token_program_id,   // token program
        );

        instructions.push(ata_instruction);
        info!("successfully added `create ata` instruction");
    }

    /*
     *   INSTRUCTION: TRADE EVENT & DATA
     *   add a trade event instruction containing the encoded buy/sell details
     */

    // derive ATAs for the bonding curve and user
    let associated_bonding_curve_address =
        get_ata_with_program(&bonding_curve_pubkey, &command.token_mint, &token_program_id);
    let associated_user_address =
        get_ata_with_program(user_pubkey, &command.token_mint, &token_program_id);
    debug!(
        associated_bonding_curve_address = %associated_bonding_curve_address,
        associated_user_address = %associated_user_address,
        "derived ATA addresses"
    );

    // derive creator vault address
    let (creator_vault_address, _) =
        Pubkey::find_program_address(&[b"creator-vault", creator.as_ref()], &pump_program_id);
    debug!("derived creator vault address: {}", creator_vault_address);

    // derive accumulator addresses
    let (global_volume_accumulator, _) =
        Pubkey::find_program_address(&[b"global_volume_accumulator"], &pump_program_id);
    let (user_volume_accumulator, _) = Pubkey::find_program_address(
        &[b"user_volume_accumulator", user_pubkey.as_ref()],
        &pump_program_id,
    );
    debug!(
        global_volume_accumulator = %global_volume_accumulator,
        user_volume_accumulator = %user_volume_accumulator,
        "derived accumulator addresses"
    );

    // derive fee config PDA
    let (fee_config_pda, _) =
        Pubkey::find_program_address(&[b"fee_config", pump_program_id.as_ref()], &fee_program_id);
    debug!("derived fee config pda: {}", fee_config_pda);

    // create the trade data
    let mut trade_data = Vec::with_capacity(24);

    // start with IDL discriminator
    trade_data.extend_from_slice(if command.is_buy {
        &BUY_DISCRIMINATOR
    } else {
        &SELL_DISCRIMINATOR
    });

    // then append the encoded token and SOL amounts of the trade
    trade_data.extend_from_slice(&command.token_amount.to_le_bytes());
    trade_data.extend_from_slice(&command.sol_amount.to_le_bytes());
    debug!("encoded trade data: {:?}", trade_data);

    // determine fee recipient: use hardcoded mayhem fee recipient for mayhem mode, otherwise use regular fee_recipient
    // Note: reserved_fee_recipient in Global may not be set correctly yet, so we use the hardcoded value from docs
    let mayhem_fee_recipient = Pubkey::from_str(MAYHEM_FEE_RECIPIENT)?;
    let fee_recipient = if command.is_mayhem {
        mayhem_fee_recipient
    } else {
        global_state.fee_recipient
    };

    // the accounts differ slightly for BUY and SELL instructions
    let trade_accounts = if command.is_buy {
        // BUY trade instruction account list
        vec![
            // first eight `base` accounts are the same for both
            AccountMeta::new_readonly(global_pubkey, false),
            AccountMeta::new(fee_recipient, false),
            AccountMeta::new_readonly(command.token_mint, false),
            AccountMeta::new(bonding_curve_pubkey, false),
            AccountMeta::new(associated_bonding_curve_address, false),
            AccountMeta::new(associated_user_address, false),
            AccountMeta::new(*user_pubkey, true),
            AccountMeta::new_readonly(system_program::id(), false),
            // divergence
            AccountMeta::new_readonly(token_program_id, false), // 8
            AccountMeta::new(creator_vault_address, false),
            AccountMeta::new_readonly(event_authority, false),
            AccountMeta::new_readonly(pump_program_id, false),
            // BUY-only accounts
            AccountMeta::new(global_volume_accumulator, false),
            AccountMeta::new(user_volume_accumulator, false),
            // new required fee accounts
            AccountMeta::new_readonly(fee_config_pda, false),
            AccountMeta::new_readonly(fee_program_id, false),
        ]
    } else {
        // SELL trade instruction account list
        vec![
            // first eight `base` accounts are the same for both
            AccountMeta::new_readonly(global_pubkey, false),
            AccountMeta::new(fee_recipient, false),
            AccountMeta::new_readonly(command.token_mint, false),
            AccountMeta::new(bonding_curve_pubkey, false),
            AccountMeta::new(associated_bonding_curve_address, false),
            AccountMeta::new(associated_user_address, false),
            AccountMeta::new(*user_pubkey, true),
            AccountMeta::new_readonly(system_program::id(), false),
            // divergence
            AccountMeta::new(creator_vault_address, false),
            AccountMeta::new_readonly(token_program_id, false),
            AccountMeta::new_readonly(event_authority, false),
            AccountMeta::new_readonly(pump_program_id, false),
            // new required fee accounts
            AccountMeta::new_readonly(fee_config_pda, false),
            AccountMeta::new_readonly(fee_program_id, false),
        ]
    };
    debug!("built trade instruction account list: {:?}", trade_accounts);

    let trade_instruction = Instruction {
        program_id: pump_program_id,
        accounts: trade_accounts,
        data: trade_data,
    };
    instructions.push(trade_instruction);
    info!(
        "successfully added `{}` instruction",
        if command.is_buy { "BUY" } else { "SELL" }
    );

    // return all built instructions in order
    Ok(instructions)
}
