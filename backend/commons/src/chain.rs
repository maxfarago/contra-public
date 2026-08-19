use borsh::{BorshDeserialize, BorshSerialize};
use serde::Deserialize;
use solana_sdk::pubkey::Pubkey;

pub const PUMP_PROGRAM_ID: &str = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
pub const PUMPSWAP_PROGRAM_ID: &str = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
pub const ASSOCIATED_TOKEN_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
pub const TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
pub const TOKEN_2022_PROGRAM_ID: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
pub const PUMP_GLOBAL_PUBKEY: &str = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf";
pub const PUMPSWAP_GLOBAL_PUBKEY: &str = "ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw";

// ===================================
// ----- PUMP.FUN ON-CHAIN STATE -----
// ===================================

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct Global {
    pub initialized: bool,
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub initial_virtual_token_reserves: u64,
    pub initial_virtual_sol_reserves: u64,
    pub initial_real_token_reserves: u64,
    pub token_total_supply: u64,
    pub fee_basis_points: u64,
    pub withdraw_authority: Pubkey,
    pub enable_migrate: bool,
    pub pool_migration_fee: u64,
    pub creator_fee_basis_points: u64,
    pub fee_recipients: [Pubkey; 7],
    pub set_creator_authority: Pubkey,
    pub reserved_fee_recipient: Pubkey,
    pub mayhem_mode_enabled: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct BondingCurve {
    pub virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub token_total_supply: u64,
    pub complete: bool,
    pub creator: Pubkey,
    pub is_mayhem_mode: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct Pool {
    pub _pool_bump: u8,
    pub _index: u16,
    pub creator: Pubkey,
    pub _base_mint: Pubkey,
    pub _quote_mint: Pubkey,
    pub _lp_mint: Pubkey,
    pub pool_base_token_account: Pubkey,
    pub pool_quote_token_account: Pubkey,
    pub _lp_supply: u64,
    pub coin_creator: Pubkey,
    pub is_mayhem_mode: bool,
}

#[derive(Debug, Clone)]
pub struct PumpFunData {
    pub global_state: Global,
    pub creator: Pubkey,
    pub bonding_curve: BondingCurve,
}

#[derive(Debug, Clone)]
pub struct PumpSwapData {
    pub coin_creator: Pubkey,
    pub pool_base_token_account: Pubkey,
    pub pool_quote_token_account: Pubkey,
    pub pool_base_reserves: u64,
    pub pool_quote_reserves: u64,
    pub global_config: GlobalConfig,
}

// ===================================
// ----- DYNAMIC FEE STRUCTURES  -----
// ===================================

#[derive(BorshDeserialize, Debug, Clone, Deserialize)]
pub struct Fees {
    pub lp_fee_bps: u64,
    pub protocol_fee_bps: u64,
    pub creator_fee_bps: u64,
}

#[derive(BorshDeserialize, Debug, Clone, Deserialize)]
pub struct FeeTier {
    pub market_cap_lamports_threshold: u128,
    pub fees: Fees,
}

#[derive(BorshDeserialize, Debug, Clone, Deserialize)]
pub struct FeeConfig {
    pub bump: u8,
    pub admin: Pubkey,
    pub flat_fees: Fees,
    pub fee_tiers: Vec<FeeTier>,
}

// ===================================
// ----- MIGRATION DATA STRUCTURES -----
// ===================================

#[derive(Debug, Clone)]
pub struct MigrationData {
    pub pool_address: Pubkey,
    pub pool_base_token_account: Pubkey,
    pub pool_quote_token_account: Pubkey,
    pub pool_creator: Pubkey,
    pub coin_creator: Pubkey,
}

// ===================================
// ----- PUMPSWAP ON-CHAIN STATE -----
// ===================================

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub lp_fee_basis_points: u64,
    pub protocol_fee_basis_points: u64,
    pub disable_flags: u8,
    pub protocol_fee_recipients: [Pubkey; 8],
    pub coin_creator_fee_basis_points: u64,
    pub admin_set_coin_creator_authority: Pubkey,
    pub whitelist_pda: Pubkey,
    pub reserved_fee_recipient: Pubkey,
    pub mayhem_mode_enabled: bool,
}
