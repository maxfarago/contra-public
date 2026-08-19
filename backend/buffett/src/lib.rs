mod handlers;
pub mod registry;

use crate::registry::TradeRegistry;
use anyhow::Result;
use commons::contracts::{
    ActorMailbox, BuffettCommand, ExecutionOrder, ExecutionResult, HermesCommand, ShylockCommand,
    TransactionLogs,
};
use dashmap::DashMap;
use guillotine::WalletManagerCommand;
use rosetta::token_parser::{extract_market_identifiers, MarketIdentifier};
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info, trace, warn};
use trades::TokenStateCache;

pub type PoolToMintMap = Arc<DashMap<Pubkey, (Pubkey, u32)>>;

pub struct Buffett {
    command_sender: mpsc::UnboundedSender<BuffettCommand>,
    command_receiver: mpsc::UnboundedReceiver<BuffettCommand>,
    ticker_receiver: mpsc::UnboundedReceiver<TransactionLogs>,
    execution_result_receiver: mpsc::UnboundedReceiver<ExecutionResult>,
    registry: TradeRegistry,
    pool_to_mint_map: PoolToMintMap,
    state_cache: TokenStateCache,
    rpc_client: Arc<RpcClient>,
    hermes_sender: mpsc::UnboundedSender<HermesCommand>,
    wallet_manager_sender: mpsc::UnboundedSender<WalletManagerCommand>,
    shylock_command_sender: mpsc::UnboundedSender<ShylockCommand>,
    execution_order_sender: mpsc::UnboundedSender<ExecutionOrder>,
}

impl Buffett {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        command_sender: mpsc::UnboundedSender<BuffettCommand>,
        command_receiver: mpsc::UnboundedReceiver<BuffettCommand>,
        ticker_receiver: mpsc::UnboundedReceiver<TransactionLogs>,
        execution_result_receiver: mpsc::UnboundedReceiver<ExecutionResult>,
        registry: TradeRegistry,
        pool_to_mint_map: PoolToMintMap,
        state_cache: TokenStateCache,
        rpc_client: Arc<RpcClient>,
        hermes_sender: mpsc::UnboundedSender<HermesCommand>,
        wallet_manager_sender: mpsc::UnboundedSender<WalletManagerCommand>,
        shylock_command_sender: mpsc::UnboundedSender<ShylockCommand>,
        execution_order_sender: mpsc::UnboundedSender<ExecutionOrder>,
    ) -> Result<Self> {
        info!("initializing buffett orchestrator...");
        Ok(Self {
            command_sender,
            command_receiver,
            ticker_receiver,
            execution_result_receiver,
            registry,
            pool_to_mint_map,
            state_cache,
            rpc_client,
            hermes_sender,
            wallet_manager_sender,
            shylock_command_sender,
            execution_order_sender,
        })
    }

    pub async fn start(mut self) {
        info!("starting buffett orchestrator...");
        self.command_loop().await;
    }

    async fn command_loop(&mut self) {
        info!("buffett is listening for commands...");
        loop {
            tokio::select! {
                Some(command) = self.command_receiver.recv() => {
                    debug!("received command: {:?}", command);
                    let result = match command {
                        BuffettCommand::CreateTrade { trade_config } => self.handle_create_trade(trade_config).await,
                        BuffettCommand::DeleteTrade { trade_id } => self.handle_delete_trade(trade_id).await,
                        BuffettCommand::RemoveOrder { trade_id, order_id } => self.handle_remove_order(trade_id, order_id).await,
                        BuffettCommand::ForwardExecutionOrder { order } => {
                            if let Err(e) = self.execution_order_sender.send(order) {
                                error!("failed to forward execution order to guillotine: {}", e);
                            }
                            Ok(())
                        }
                        BuffettCommand::TradeComplete { trade_id } => {
                            if let Err(e) = self.handle_trade_complete(trade_id).await {
                                error!("error handling trade completion command: {}", e);
                            }
                            Ok(())
                        }
                    };

                    if let Err(e) = result {
                        error!("failed to process command: {}", e);
                    }
                },
                Some(tx_logs) = self.ticker_receiver.recv() => {
                    trace!("received transaction logs: {}", tx_logs.signature);
                    self.route_transaction_logs(tx_logs).await;
                },
                Some(result) = self.execution_result_receiver.recv() => {
                    // --- DEBUG STEP 2: Confirm message is received by Buffett ---
                    debug!(trade_id = %result.trade_id, "received execution result from guillotine");

                    // Hold onto the trade_id before `result` is moved.
                    let trade_id = result.trade_id.clone();

                    if let Some(trade_info) = self.registry.get_trade(&trade_id).await {
                        // --- DEBUG STEP 3: Confirm trade actor was found in registry ---
                        debug!(trade_id = %trade_id, "found target trade actor in registry");

                        let msg = ActorMailbox::ExecutionResult(result);
                        if let Err(e) = trade_info.mailbox_sender.send(msg) {
                            if let ActorMailbox::ExecutionResult(result) = e.0 {
                                error!(trade_id = %result.trade_id, "failed to send execution result to trade actor (receiver dropped)");
                            }
                        } else {
                            // --- DEBUG STEP 4: Confirm message was forwarded to actor ---
                            debug!(trade_id = %trade_id, "successfully forwarded result to trade actor");
                        }
                    } else {
                        warn!(trade_id = %trade_id, "received execution result for unknown or completed trade");
                    }
                }
            }
        }
    }

    async fn route_transaction_logs(&self, tx_logs: TransactionLogs) {
        let market_ids = extract_market_identifiers(&tx_logs.logs);
        if market_ids.is_empty() {
            return;
        }

        for market_id in market_ids {
            let mint_key = match market_id {
                MarketIdentifier::Mint(mint) => mint,
                MarketIdentifier::Pool(pool) => {
                    if let Some(mapping) = self.pool_to_mint_map.get(&pool) {
                        mapping.value().0 // The mint is the first element of the tuple
                    } else {
                        trace!("no mint mapping found for pool {}", pool);
                        continue;
                    }
                }
            };

            let subscribers = self.registry.get_subscribers(&mint_key).await;
            if subscribers.is_empty() {
                continue;
            }

            debug!(
                "routing tx {} to {} trade(s) monitoring mint {}",
                tx_logs.signature,
                subscribers.len(),
                mint_key
            );

            for sender in subscribers {
                let msg = ActorMailbox::TransactionLogs(tx_logs.clone());
                if let Err(e) = sender.send(msg) {
                    warn!(
                        "failed to send tx logs to trade actor (receiver dropped): {}",
                        e
                    );
                }
            }
        }
    }
}
