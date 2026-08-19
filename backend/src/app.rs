use buffett::{registry::TradeRegistry, Buffett, PoolToMintMap};
use commons::contracts::{
    BuffettCommand, ExecutionOrder, ExecutionResult, HermesCommand, ShylockCommand, TransactionLogs,
};
use guillotine::{TransactionExecutor, WalletManagerCommand};
use hermes::Hermes;
use janus::Janus;
use shylock::Shylock;
use ticker::Ticker;

use anyhow::Result;
use aws_config::{meta::region::RegionProviderChain, BehaviorVersion};
use aws_sdk_kms::Client as KmsClient;
use config::Config;
use dashmap::DashMap;
use solana_client::rpc_client::RpcClient;
use sqlx::PgPool;
use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info, warn};
use trades::TokenStateCache;

pub struct Application {
    guillotine: TransactionExecutor,
    shylock: Shylock,
    buffett: Buffett,
    ticker: Ticker,
}

impl Application {
    pub async fn build(config: &Config) -> Result<Self> {
        // --- AWS + KMS ---
        let kms_key_id = env::var("KMS_KEY_ID")?;
        let region_provider = RegionProviderChain::default_provider().or_else("us-east-1");
        let aws_shared_config = aws_config::defaults(BehaviorVersion::latest())
            .region(region_provider)
            .load()
            .await;
        let kms_client = KmsClient::new(&aws_shared_config);

        // --- Hermes (Database) ---
        let db_cxn_string = env::var("DB_CXN_STRING")?;
        let db_pool = PgPool::connect(&db_cxn_string).await?;
        let (hermes_sender, hermes_receiver) = mpsc::unbounded_channel::<HermesCommand>();
        let hermes_service = Hermes::new(db_pool, hermes_receiver)?;
        hermes_service.start();

        // --- Trades ---
        let state_cache: TokenStateCache = Arc::new(RwLock::new(HashMap::new()));
        let pool_to_mint_map: PoolToMintMap = Arc::new(DashMap::new());
        let trade_registry = TradeRegistry::new();

        // --- RPC ---
        let rpc_url = env::var("RPC_URL")?;
        let rpc_api_key = env::var("RPC_API_KEY")?;
        let rpc_url_with_key = format!("{}?api-key={}", rpc_url, rpc_api_key);
        let rpc_client = Arc::new(RpcClient::new(rpc_url_with_key));

        // --- Channels ---
        let (execution_order_sender, execution_order_receiver) =
            mpsc::unbounded_channel::<ExecutionOrder>();
        let (execution_result_sender, execution_result_receiver) =
            mpsc::unbounded_channel::<ExecutionResult>();
        let (wallet_message_sender, wallet_message_receiver) =
            mpsc::unbounded_channel::<WalletManagerCommand>();
        let (buffett_sender, buffett_receiver) = mpsc::unbounded_channel::<BuffettCommand>();
        let (ticker_sender, ticker_receiver) = mpsc::unbounded_channel::<TransactionLogs>();
        let (shylock_command_sender, shylock_command_receiver) =
            mpsc::unbounded_channel::<ShylockCommand>();

        // --- Shylock (Oracle) ---
        let shylock = Shylock::new(
            rpc_url.clone(),
            rpc_api_key.clone(),
            hermes_sender.clone(),
            shylock_command_receiver,
        );

        // --- Guillotine (Executor) ---
        let mut guillotine = TransactionExecutor::new(
            execution_order_receiver,
            wallet_message_receiver,
            rpc_client.clone(),
            kms_client,
            kms_key_id,
            hermes_sender.clone(),
            execution_result_sender.clone(),
            shylock_command_sender.clone(),
        )?;
        if config.get_bool("live_trading_enabled").unwrap_or(false) {
            warn!("GUILLOTINE INITIALIZED WITH LIVE TRADING ENABLED!");
            guillotine = guillotine.enable_live_trading();
        } else {
            info!("guillotine initialized in DRY-RUN mode.");
        }

        // --- Buffett (Orchestrator) ---
        let buffett = Buffett::new(
            buffett_sender.clone(),
            buffett_receiver,
            ticker_receiver,
            execution_result_receiver,
            trade_registry,
            pool_to_mint_map,
            state_cache.clone(),
            rpc_client.clone(),
            hermes_sender.clone(),
            wallet_message_sender,
            shylock_command_sender.clone(),
            execution_order_sender,
        )?;

        // --- Janus (Gateway) ---
        let sqs_queue_url = env::var("SQS_QUEUE_URL")?;
        let janus = Janus::new(
            sqs_queue_url,
            aws_shared_config.clone(),
            buffett_sender.clone(),
        )
        .await?;
        janus.start().await;

        // --- Ticker (Ingester) ---
        let ticker = Ticker::new(ticker_sender)?;

        Ok(Self {
            guillotine,
            shylock,
            buffett,
            ticker,
        })
    }

    pub async fn run(self) -> Result<()> {
        info!("axton is live!");

        // Spawn all service tasks
        let guillotine_handle = tokio::spawn(async move {
            if let Err(e) = self.guillotine.start().await {
                error!("guillotine exited with error: {}", e);
            }
        });

        let shylock_handle = tokio::spawn(async move {
            if let Err(e) = self.shylock.start().await {
                error!("shylock exited with error: {}", e);
            }
        });

        let buffett_handle = tokio::spawn(async move {
            self.buffett.start().await;
        });

        let ticker_handle = tokio::spawn(async move {
            if let Err(e) = self.ticker.start().await {
                error!("ticker exited with error: {}", e);
            }
        });

        // engage!
        tokio::try_join!(
            guillotine_handle,
            shylock_handle,
            buffett_handle,
            ticker_handle
        )?;

        Ok(())
    }
}
