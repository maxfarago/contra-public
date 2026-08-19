use crate::chain::{PUMPSWAP_PROGRAM_ID, PUMP_PROGRAM_ID};
use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum Protocol {
    PumpFun,
    PumpSwap,
}

impl Protocol {
    pub fn program_id(&self) -> Pubkey {
        match self {
            Protocol::PumpFun => PUMP_PROGRAM_ID.parse().unwrap(),
            Protocol::PumpSwap => PUMPSWAP_PROGRAM_ID.parse().unwrap(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct TokenContext {
    pub token_mint: Pubkey,
    pub bonding_curve: Pubkey,
    pub bonding_curve_creator: Option<Pubkey>, // The user wallet that created the bonding curve.
    pub pool_creator: Option<Pubkey>, // The PDA that is the authority of a canonical pumpswap pool.
    pub coin_creator: Option<Pubkey>, // The user wallet that created the coin, stored in the pool account.
    pub pool: Option<Pubkey>,
    pub pool_base_token_account: Option<Pubkey>,
    pub pool_quote_token_account: Option<Pubkey>,
    pub is_migrated: bool,
    pub is_mayhem: bool,
    pub token_program_id: Pubkey,
}

pub type TxSignature = String;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExecutionStage {
    Submitted,
    Confirmed,
    Failed,
}
