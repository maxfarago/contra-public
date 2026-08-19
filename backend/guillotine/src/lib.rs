mod executor;
mod instruction_builder;
mod protocols;
mod transaction_sender;
mod wallet_manager;

pub use executor::TransactionExecutor;
pub use wallet_manager::WalletManagerCommand;

#[derive(Debug, Clone)]
pub struct ExecutionPlan {
    pub instructions: Vec<solana_sdk::instruction::Instruction>,
    pub compute_unit_limit: Option<u32>,
    pub priority_fee_microlamports_per_cu: Option<u64>,
    pub max_retries: u8,
}
