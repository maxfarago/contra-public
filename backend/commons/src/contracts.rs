use crate::{
    chain::{FeeConfig, Global, GlobalConfig, PumpFunData, PumpSwapData},
    types::{ExecutionStage, Protocol, TokenContext, TxSignature},
};
use anyhow::Result;
use serde::Deserialize;
use serde_json::Value;
use solana_sdk::pubkey::Pubkey;
use std::sync::Arc;
use tokio::sync::oneshot;

// =======================================
// ----- SERVICE-TO-SERVICE MESSAGES -----
// =======================================

// For messages FROM Buffett TO a TradeActor
#[derive(Debug, Clone)]
pub enum ActorMailbox {
    TransactionLogs(TransactionLogs),
    ExecutionResult(ExecutionResult),
    AddOrder(OrderParameters),
    RemoveOrder { order_id: String },
}

// For messages TO Buffett from ANYWHERE
#[derive(Debug)]
pub enum BuffettCommand {
    CreateTrade { trade_config: Value },
    DeleteTrade { trade_id: String },
    RemoveOrder { trade_id: String, order_id: String },
    ForwardExecutionOrder { order: ExecutionOrder },
    TradeComplete { trade_id: String },
}

// ===================================
// ----- HERMES DATABASE CONTRACTS ---
// ===================================

#[derive(Debug, Clone)]
pub enum OrderType {
    OneShot,
    Countersell,
}

#[derive(Debug, Clone)]
pub enum HermesCommand {
    UpdateOrderStatus {
        order_id: String,
        status: String,
    },
    Log {
        level: String,
        message: String,
    },
    LogOrder {
        order_id: String,
        level: String,
        message: String,
    },
    LogTransaction {
        signature: String,
        order_id: String,
        order_type: String,
        protocol: String,
        slot: Option<u64>,
        submitted_by: String,
        request_amount_lamports: Option<u64>,
        request_amount_microtokens: Option<u64>,
        result_amount_lamports: Option<i64>,
        result_amount_microtokens: Option<i64>,
        status: String,
        metadata: Option<serde_json::Value>,
    },
    IncrementOrderAmounts {
        order_id: String,
        sol_amount_delta: i64,
        token_amount_delta: i64,
        set_as_complete: bool,
    },
}

// ===================================
// ----- SHYLOCK ORACLE CONTRACTS ----
// ===================================

#[derive(Debug, Clone)]
pub struct CachedTokenData {
    pub priority_fee: u64,
    pub fee_config: Option<FeeConfig>,
    pub pumpfun_data: Option<PumpFunData>,
    pub pumpswap_data: Option<PumpSwapData>,
}

// For messages TO Shylock from ANYWHERE
#[derive(Debug)]
pub enum ShylockCommand {
    RegisterToken {
        context: TokenContext,
        reply: oneshot::Sender<Result<()>>,
    },
    DeregisterToken {
        mint: Pubkey,
    },
    GetCachedTokenData {
        mint: Pubkey,
        reply: oneshot::Sender<Option<Arc<CachedTokenData>>>,
    },
    GetPriorityFee {
        token_mint: Pubkey,
        reply: oneshot::Sender<u64>,
    },
    GetFeeConfig {
        protocol: Protocol,
        reply: oneshot::Sender<Option<FeeConfig>>,
    },
    GetLiveTokenData {
        mint: Pubkey,
        reply: oneshot::Sender<Option<Arc<CachedTokenData>>>,
    },
    GetConfirmedTransaction {
        signature: String,
        reply: oneshot::Sender<
            Result<solana_transaction_status::EncodedConfirmedTransactionWithStatusMeta>,
        >,
    },
}

#[derive(Debug)]
pub enum FeeConfigRequest {
    GetConfig {
        protocol: Protocol,
        response_sender: oneshot::Sender<Option<FeeConfig>>,
    },
}

// ===================================
// ----- EXECUTION PIPELINE DATA -----
// ===================================

#[derive(Debug, Clone)]
pub struct ExecutionOrder {
    // --- core identifiers ---
    pub trade_id: String,
    pub order_id: String,

    // --- wallet & signing ---
    pub wallet_pubkey: Pubkey,
    pub private_key_encrypted: String,

    // --- trade parameters ---
    pub is_buy: bool,
    pub token_mint: Pubkey,
    pub token_amount: u64,
    pub sol_amount: u64,
    pub fee_lamports: u64,

    // --- execution strategy ---
    pub compute_unit_limit: Option<u32>,
    pub max_retries: Option<u32>,

    // --- protocol-agnostic ---
    pub protocol: Protocol,
    pub market_address: Pubkey, // bonding curve for pumpfun; pool address for pumpswap
    pub is_mayhem: bool,
    pub token_program_id: Option<Pubkey>,

    // --- pump.fun specific accounts ---
    pub bonding_curve_creator: Option<Pubkey>,
    pub global_state: Option<Global>,

    // --- pumpswap specific accounts ---
    pub pool_creator: Option<Pubkey>,
    pub coin_creator: Option<Pubkey>,
    pub pool_base_token_account: Option<Pubkey>,
    pub pool_quote_token_account: Option<Pubkey>,
    pub global_config: Option<GlobalConfig>,
}

#[derive(Debug, Clone)]
pub struct ExecutionResult {
    pub trade_id: String,
    pub order_id: String,
    pub stage: ExecutionStage,
    pub signature: Option<String>,
    pub error: Option<String>,
    pub lamports_in: u64,
    pub lamports_out: u64,
    pub tokens_in: u64,
    pub tokens_out: u64,
}

// ==========================
// ----- DATA INGESTION -----
// ==========================

#[derive(Debug, Clone)]
pub struct TransactionLogs {
    pub protocol: Protocol,
    pub signature: TxSignature,
    pub logs: Vec<String>,
}

// ========================================
// ----- TRADE CONFIGURATION PAYLOADS -----
// ========================================

#[derive(Deserialize, Debug, Clone)]
pub struct TradeConfigBase {
    pub trade_id: Option<String>,
    pub trade_type: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct CountersellConfig {
    pub order_id: String,
    pub account_id: String,
    pub token_to_monitor: String,
    pub wallet_public_key: String,
    pub wallet_private_key_encrypted: String,
    pub initial_holdings_microtokens: u64,
    pub max_to_sell_microtokens: u64,
    pub mcap_threshold_lamports: u64,
    pub buy_threshold_lamports: u64,
    pub sell_pct_bps: u16,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OrderParameters {
    pub order_id: String,
    pub max_to_sell_microtokens: u64,
    pub mcap_threshold_lamports: u64,
    pub buy_threshold_lamports: u64,
    pub sell_pct_bps: u16,
}

#[derive(Deserialize, Debug)]
pub struct OneShotBuyConfig {
    pub order_id: String,
    pub account_id: String,
    pub token_to_buy: String,
    pub wallet_public_key: String,
    pub wallet_private_key_encrypted: String,
    pub sol_amount: u64,
    pub slippage_bps: u16,
}

#[derive(Deserialize, Debug)]
pub struct OneShotSellConfig {
    pub order_id: String,
    pub account_id: String,
    pub token_to_sell: String,
    pub wallet_public_key: String,
    pub wallet_private_key_encrypted: String,
    pub token_amount: u64,
    pub slippage_bps: u16,
}
