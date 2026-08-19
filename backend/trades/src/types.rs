use commons::{chain::MigrationData, contracts::OrderParameters, types::Protocol};
use solana_sdk::pubkey::Pubkey;

// holds both the configuration and the dynamic state for a single order
#[derive(Debug, Clone)]
pub struct OrderState {
    pub params: OrderParameters,
    pub microtokens_sold: u64,
    pub microtokens_pending: u64,
}

// raw log data from an event ingester
#[derive(Debug, Clone)]
pub struct PumpLog {
    pub signature: String,
    pub raw_data: String,
    pub program_id: Pubkey,
}

#[derive(Debug, PartialEq)]
pub enum RollupResultType {
    Trade,
    Completed,
    Migrated,
}

#[derive(Debug)]
pub struct RollupResult {
    pub result_type: RollupResultType,
    pub protocol: Protocol,
    pub net_sol_lamports: i64,
    pub final_market_cap_lamports: u128,
    pub final_reserves: (u64, u64),
    pub final_signature: String,
    pub migration_data: Option<MigrationData>,
}
