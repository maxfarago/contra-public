use anyhow::Result;
use async_trait::async_trait;
use commons::{
    contracts::{
        ExecutionOrder, ExecutionResult, OrderParameters, ShylockCommand, TransactionLogs,
    },
    types::TokenContext,
};
use solana_sdk::pubkey::Pubkey;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

pub mod actor;
pub mod examples;
pub mod price_calculator;
pub mod protocol_detector;
pub mod pumpfun_events;
pub mod pumpswap_events;
pub mod types;

// re-exports types for easy access
pub use types::{OrderState, PumpLog};

// cache of token-specific data for use across trades and components
#[derive(Debug, Clone, Default)]
pub struct TokenState {
    pub market_cap: Option<f64>,
}
pub type TokenStateCache = Arc<RwLock<HashMap<Pubkey, TokenState>>>;

// map of monitored tokens to the trades monitoring them
pub type TradeMap = HashMap<Pubkey, Vec<Box<dyn Trade>>>;

// ================================
// -----  CORE TRADE TRAIT -----
// ================================

#[async_trait]
pub trait Trade: Send + Sync {
    fn name(&self) -> &str;

    // returns the unique identifier for this trade instance
    fn id(&self) -> &str;

    // returns the token mint this trade is monitoring
    fn monitored_token(&self) -> Pubkey;

    // returns true if the trade should be processing transactions
    async fn is_active(&self) -> bool;

    // returns the wallet pubkey this trade uses for signing
    fn get_wallet_pubkey(&self) -> Option<Pubkey>;

    // get current protocol context for the monitored token
    async fn get_token_context(&self) -> Option<TokenContext>;

    // processes incoming tx logs for triggering execution orders
    async fn process_logs(&mut self, logs: TransactionLogs) -> Result<Option<ExecutionOrder>>;

    // called when trade is first loaded
    async fn initialize(&mut self) -> Result<()>;

    // called to proactively trigger a trade's logic
    async fn activate(&mut self) -> Result<Option<ExecutionOrder>>;

    // handles results of execution orders issued by this trade
    async fn on_result(&mut self, result: ExecutionResult) -> Result<()>;

    // returns true if the trade has completed its lifecycle
    fn is_complete(&self) -> bool;

    // adds a new set of order parameters to an existing trade
    async fn add_order(&mut self, order: OrderParameters) -> Result<()>;

    // removes an order from an existing trade
    async fn remove_order(&mut self, order_id: &str) -> Result<()>;

    // called when a trade is being shut down
    async fn cleanup(
        &mut self,
        shylock_sender: &mpsc::UnboundedSender<ShylockCommand>,
    ) -> Result<()>;
}
