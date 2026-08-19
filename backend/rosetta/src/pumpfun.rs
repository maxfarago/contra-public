use anchor_lang::prelude::*;

// event discriminators from IDL
pub const TRADE_EVENT_DISCRIMINATOR: [u8; 8] = [189, 219, 127, 211, 78, 230, 97, 238];
pub const COMPLETE_EVENT_DISCRIMINATOR: [u8; 8] = [213, 115, 204, 153, 18, 16, 241, 239];

// trade event structure (unified) from IDL
#[derive(AnchorDeserialize, Debug, Clone)]
pub struct TradeEvent {
    pub mint: Pubkey,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub is_buy: bool,
    pub user: Pubkey,
    pub timestamp: i64,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
}

// migration event structure from IDL
#[derive(AnchorDeserialize, Debug, Clone)]
pub struct CompleteEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub bonding_curve: Pubkey,
    pub timestamp: i64,
}
