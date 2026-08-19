mod execute;
mod migrate;
mod parsers;
mod trigger;

use crate::{
    types::{OrderState, RollupResult, RollupResultType},
    TokenStateCache, Trade,
};
use anyhow::Result;
use commons::{
    chain::{Global, GlobalConfig},
    contracts::{
        ExecutionOrder, ExecutionResult, HermesCommand, OrderParameters, ShylockCommand,
        TransactionLogs,
    },
    types::{ExecutionStage, TokenContext},
};
use solana_sdk::{native_token::LAMPORTS_PER_SOL, pubkey::Pubkey};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, RwLock};
use tracing::{debug, error, info, trace, warn};

const COUNTERSELL_CU_LIMIT: u32 = 200_000;
const MAX_CONSECUTIVE_FAILURES: u32 = 3;

pub struct Countersell {
    pub id: String,
    pub account_id: String,
    pub token_to_monitor: Pubkey,
    pub wallet_pubkey: Pubkey,
    pub private_key_encrypted: String,
    orders: Arc<RwLock<Vec<OrderState>>>,
    cached_token_total_supply: Option<u64>,
    initial_holdings_microtokens: u64,
    total_microtokens_sold: Arc<RwLock<u64>>,
    total_microtokens_pending: Arc<RwLock<u64>>,
    state_cache: TokenStateCache,
    hermes_sender: mpsc::UnboundedSender<HermesCommand>,
    shylock_command_sender: mpsc::UnboundedSender<ShylockCommand>,
    token_context: Arc<RwLock<TokenContext>>,
    is_complete: Arc<RwLock<bool>>,
    pumpfun_global_state: Option<Global>,
    pumpswap_global_config: Option<GlobalConfig>,
    consecutive_failures: u32,
}

impl Countersell {
    pub fn new(
        id: String,
        account_id: String,
        token_to_monitor: Pubkey,
        wallet_pubkey: Pubkey,
        private_key_encrypted: String,
        orders: Vec<OrderParameters>,
        initial_holdings_microtokens: u64,
        state_cache: TokenStateCache,
        hermes_sender: mpsc::UnboundedSender<HermesCommand>,
        shylock_command_sender: mpsc::UnboundedSender<ShylockCommand>,
        token_context: TokenContext,
    ) -> Self {
        let order_states = orders
            .into_iter()
            .map(|params| OrderState {
                params,
                microtokens_sold: 0,
                microtokens_pending: 0,
            })
            .collect();

        Self {
            id,
            account_id,
            token_to_monitor,
            wallet_pubkey,
            private_key_encrypted,
            orders: Arc::new(RwLock::new(order_states)),
            cached_token_total_supply: None, // This will need to be populated from Shylock.
            initial_holdings_microtokens,
            total_microtokens_sold: Arc::new(RwLock::new(0)),
            total_microtokens_pending: Arc::new(RwLock::new(0)),
            state_cache,
            hermes_sender,
            shylock_command_sender,
            token_context: Arc::new(RwLock::new(token_context)),
            is_complete: Arc::new(RwLock::new(false)),
            pumpfun_global_state: None,
            pumpswap_global_config: None,
            consecutive_failures: 0,
        }
    }
}

#[async_trait::async_trait]
impl Trade for Countersell {
    fn name(&self) -> &str {
        "Countersell"
    }

    fn id(&self) -> &str {
        &self.id
    }

    fn monitored_token(&self) -> Pubkey {
        self.token_to_monitor
    }

    async fn is_active(&self) -> bool {
        !*self.is_complete.read().await
    }

    fn get_wallet_pubkey(&self) -> Option<Pubkey> {
        Some(self.wallet_pubkey)
    }

    async fn get_token_context(&self) -> Option<TokenContext> {
        Some(self.token_context.read().await.clone())
    }

    /*
        process_logs
        ------------
        - processes the transaction logs for the trade
        - returns an execution order if there are any triggered orders
    */
    async fn process_logs(&mut self, tx_logs: TransactionLogs) -> Result<Option<ExecutionOrder>> {
        // early exit if the trade is not active
        if !self.is_active().await {
            return Ok(None);
        }

        // filter down to logs containing protocol-specific program data
        let program_id = tx_logs.protocol.program_id();
        let pump_logs: Vec<crate::PumpLog> = tx_logs
            .logs
            .iter()
            .filter(|log_str| log_str.starts_with("Program data:"))
            .map(|log_str| crate::PumpLog {
                signature: tx_logs.signature.clone(),
                raw_data: log_str.to_string(),
                program_id,
            })
            .collect();

        // early exit if there are no program data logs
        if pump_logs.is_empty() {
            return Ok(None);
        }

        // step 1: parse all events from tx logs
        let parsed_events = self.parse_events_from_logs(&pump_logs).await?;
        if parsed_events.is_empty() {
            debug!(position_id = %self.id, "no relevant events parsed from transaction");
            return Ok(None);
        }

        // step 1a: early exit for migration event (after updating state)
        if self.handle_migration_event(&parsed_events).await? {
            // TODO: handle events that come after the migration event
            return Ok(None);
        }

        // step 2: filter for trade events
        let trade_events: Vec<&RollupResult> = parsed_events
            .iter()
            .filter(|e| e.result_type == RollupResultType::Trade)
            .collect();

        // step 3: roll the trade events up into a single net result
        let trade_result = if trade_events.is_empty() {
            None
        } else {
            let net_sol_lamports = trade_events.iter().map(|e| e.net_sol_lamports).sum();
            let last_event = trade_events.last().unwrap();
            debug!(
                position_id = %self.id,
                "rolled up {} trade events into a single result",
                trade_events.len()
            );
            Some(RollupResult {
                result_type: RollupResultType::Trade,
                protocol: last_event.protocol.clone(),
                net_sol_lamports,
                final_market_cap_lamports: last_event.final_market_cap_lamports,
                final_reserves: last_event.final_reserves,
                final_signature: last_event.final_signature.clone(),
                migration_data: None,
            })
        };

        let Some(trade_result) = trade_result else {
            trace!(position_id = %self.id, "no net trade result from transaction");
            return Ok(None);
        };

        // step 4: get any countersell orders triggered by the net result
        let triggered_orders = self.get_triggered_orders(&trade_result).await?;

        // step 5: write execution warrants for the triggered orders
        let execution_warrant = self.issue_warrant(triggered_orders, &trade_result).await?;

        // step 6: update the shared cache with the final market cap from the transaction
        // TODO: audit and review whether this step is necessary
        if trade_result.final_market_cap_lamports > 0 {
            let mut cache = self.state_cache.write().await;
            let state = cache.entry(self.token_to_monitor).or_default();
            state.market_cap =
                Some(trade_result.final_market_cap_lamports as f64 / LAMPORTS_PER_SOL as f64);
        }

        // return the warrant if one was issued
        if execution_warrant.is_some() {
            info!(position_id = %self.id, "generated 1 execution warrant");
        }
        Ok(execution_warrant)
    }

    // no-op (countersell is reactive, not proactive)
    async fn activate(&mut self) -> Result<Option<ExecutionOrder>> {
        Ok(None)
    }

    fn is_complete(&self) -> bool {
        self.is_complete
            .try_read()
            .map(|guard| *guard)
            .unwrap_or(false)
    }

    async fn initialize(&mut self) -> Result<()> {
        info!(position = self.name(), "initializing...");

        // register with shylock and wait for it to cache our data
        let (tx, rx) = oneshot::channel();
        let context = self.token_context.read().await.clone();
        self.shylock_command_sender
            .send(ShylockCommand::RegisterToken {
                context: context.clone(),
                reply: tx,
            })?;

        // block until shylock confirms the token data is cached
        rx.await??;
        info!(
            trade = self.name(),
            position_id = %self.id,
            "successfully registered with shylock and cached token data"
        );

        // cache global state/config based on protocol
        let (tx, rx) = oneshot::channel();
        self.shylock_command_sender
            .send(ShylockCommand::GetCachedTokenData {
                mint: self.token_to_monitor,
                reply: tx,
            })?;

        if let Some(cached_data) = rx.await? {
            if !context.is_migrated {
                // pump.fun token - cache global state
                if let Some(pumpfun_data) = cached_data.pumpfun_data.as_ref() {
                    self.pumpfun_global_state = Some(pumpfun_data.global_state.clone());
                }
            } else {
                // pumpswap token - cache global config
                if let Some(pumpswap_data) = cached_data.pumpswap_data.as_ref() {
                    self.pumpswap_global_config = Some(pumpswap_data.global_config.clone());
                }
            }
        }

        // statically set token supply (1b tokens) for market cap calculations.
        // pump.fun tokens have 6 decimals, pumpswap have 9, but the raw total
        // supply number is the same.
        self.cached_token_total_supply = Some(1_000_000_000_000_000);

        // log detected protocol to db via hermes
        let _ = self.hermes_sender.send(HermesCommand::Log {
            level: "info".to_string(),
            message: format!(
                "Trade {} currently monitoring token on {}.",
                self.id,
                if context.is_migrated {
                    "PumpSwap"
                } else {
                    "PumpFun"
                }
            ),
        });

        // Mark all orders as ACTIVE after successful initialization
        let orders = self.orders.read().await;
        for order in orders.iter() {
            let _ = self.hermes_sender.send(HermesCommand::UpdateOrderStatus {
                order_id: order.params.order_id.clone(),
                status: "ACTIVE".to_string(),
            });
            let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                order_id: order.params.order_id.clone(),
                level: "info".to_string(),
                message: format!(
                    "Created new Countersell order; monitoring token {} for wallet {}",
                    self.token_to_monitor,
                    &self.wallet_pubkey.to_string()[..4]
                ),
            });
        }
        drop(orders); // Release the read lock

        Ok(())
    }

    async fn on_result(&mut self, result: ExecutionResult) -> Result<()> {
        debug!(trade_id = %result.trade_id, order_id = %result.order_id, "countersell on_result called");

        // early exit if this result is for a different trade
        if result.trade_id != self.id {
            warn!(
                trade = self.name(),
                result = ?result,
                "ignoring result for another trade"
            );
            return Ok(());
        }

        // extract amounts from the execution result
        let tokens_amount = result.tokens_in; // for a sell, `tokens_in` is what we sold.
        let sol_amount = result.lamports_out; // for a sell, `lamports_out` is what we received.

        match result.stage {
            // SUCCESSFUL execution (w00t!)
            ExecutionStage::Confirmed => {
                info!(order_id = %result.order_id, "received confirmed execution result");

                // reset the failure counter on success
                self.consecutive_failures = 0;

                // release the trade's total pending token count
                *self.total_microtokens_pending.write().await -= tokens_amount;

                // update the trade's total sold amount and get the new total
                let total_sold = {
                    let mut sold_guard = self.total_microtokens_sold.write().await;
                    *sold_guard += tokens_amount;
                    *sold_guard
                };

                // update the specific order's state within a locked scope
                {
                    let mut orders = self.orders.write().await;
                    if let Some(order) = orders
                        .iter_mut()
                        .find(|o| o.params.order_id == result.order_id)
                    {
                        // release the order's pending tokens and increment its sold amount
                        order.microtokens_pending =
                            order.microtokens_pending.saturating_sub(tokens_amount);
                        order.microtokens_sold += tokens_amount;

                        // get the real balance changes by fetching the confirmed transaction
                        let signature_str = result.signature.clone().unwrap_or_default();
                        let tx_details: Option<
                            solana_transaction_status::EncodedConfirmedTransactionWithStatusMeta,
                        > = if !signature_str.is_empty() {
                            let (tx_reply, rx_reply) = oneshot::channel();
                            self.shylock_command_sender.send(
                                ShylockCommand::GetConfirmedTransaction {
                                    signature: signature_str.clone(),
                                    reply: tx_reply,
                                },
                            )?;
                            Some(rx_reply.await??)
                        } else {
                            None
                        };

                        let (sol_change, token_change, slot, metadata) =
                            if let Some(tx) = tx_details {
                                let slot = Some(tx.slot);
                                let metadata = tx
                                    .transaction
                                    .meta
                                    .as_ref()
                                    .and_then(|m| serde_json::to_value(m).ok());
                                let context = self.token_context.read().await;
                                let (sol_change, token_change) =
                                    rosetta::token_parser::parse_balance_changes(
                                        tx,
                                        &self.wallet_pubkey,
                                        &context,
                                    )?;
                                (sol_change, token_change, slot, metadata)
                            } else {
                                (sol_amount as i64, -(tokens_amount as i64), None, None)
                            };

                        // log the successful transaction to the database
                        let protocol = self.token_context.read().await;
                        let _ = self.hermes_sender.send(HermesCommand::LogTransaction {
                            signature: signature_str,
                            order_id: result.order_id.clone(),
                            order_type: self.name().to_string(),
                            protocol: if protocol.is_migrated {
                                "PumpSwap"
                            } else {
                                "PumpFun"
                            }
                            .to_string(),
                            slot: slot,
                            submitted_by: self.account_id.clone(),
                            request_amount_lamports: None,
                            request_amount_microtokens: Some(result.tokens_in),
                            result_amount_lamports: Some(sol_change),
                            result_amount_microtokens: Some(token_change),
                            status: "CONFIRMED".to_string(),
                            metadata,
                        });
                        let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                            order_id: result.order_id.clone(),
                            level: "info".to_string(),
                            message: format!(
                                "countersell successful! {:.2} tokens sold for {:.4} SOL",
                                token_change.unsigned_abs() as f64 / 1_000_000.0,
                                sol_change.unsigned_abs() as f64 / LAMPORTS_PER_SOL as f64
                            ),
                        });

                        // check if the order has now sold its maximum allocation
                        let is_order_complete =
                            order.microtokens_sold >= order.params.max_to_sell_microtokens;

                        // increment order SOL/token amounts in db and (optionally) mark as complete
                        let _ = self
                            .hermes_sender
                            .send(HermesCommand::IncrementOrderAmounts {
                                order_id: result.order_id.clone(),
                                sol_amount_delta: sol_change,
                                token_amount_delta: token_change,
                                set_as_complete: is_order_complete,
                            });

                        if is_order_complete {
                            info!(
                                order_id = %result.order_id,
                                "order maximum reached; countersell completed"
                            );
                            let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                                order_id: result.order_id.clone(),
                                level: "info".to_string(),
                                message: format!("order maximum reached; countersell completed"),
                            });
                        }
                    }
                }

                // after all state is updated, check for trade completion
                {
                    // condition 1: all orders have been completed and removed
                    let mut orders = self.orders.write().await;
                    // atomically remove any completed orders from the in-memory vector
                    orders.retain(|o| o.microtokens_sold < o.params.max_to_sell_microtokens);

                    // condition 2: wallet is exhausted
                    let wallet_exhausted = total_sold >= self.initial_holdings_microtokens;

                    // when either condition is met, mark the position as complete
                    if orders.is_empty() || wallet_exhausted {
                        // when the user's wallet is exhausted, cancel any active orders
                        if wallet_exhausted && !orders.is_empty() {
                            info!(
                                trade_id = %self.id,
                                "wallet exhausted; cancelling {} remaining orders",
                                orders.len()
                            );
                            for order in orders.iter() {
                                let _ = self.hermes_sender.send(HermesCommand::UpdateOrderStatus {
                                    order_id: order.params.order_id.clone(),
                                    status: "CANCELLED".to_string(),
                                });
                            }
                        }
                        // set the trade's state to complete, triggering its shutdown
                        info!(trade_id = %self.id, "countersell trade is now complete");
                        *self.is_complete.write().await = true;
                    }
                }
            }
            // FAILED execution (oh noes)
            ExecutionStage::Failed => {
                warn!(order_id = %result.order_id, "received failed execution result");

                // release the trade's total pending token count
                *self.total_microtokens_pending.write().await -= tokens_amount;

                // on failure, only release the order's pending tokens and log the error
                {
                    let mut orders = self.orders.write().await;
                    if let Some(order) = orders
                        .iter_mut()
                        .find(|o| o.params.order_id == result.order_id)
                    {
                        order.microtokens_pending =
                            order.microtokens_pending.saturating_sub(tokens_amount);
                    }
                }

                // log the failed transaction attempt
                let protocol = self.token_context.read().await;
                let metadata = result
                    .error
                    .clone()
                    .map(|e| serde_json::json!({ "error": e }));
                let _ = self.hermes_sender.send(HermesCommand::LogTransaction {
                    signature: result.signature.unwrap_or_else(|| "N/A".to_string()),
                    order_id: result.order_id.clone(),
                    order_type: self.name().to_string(),
                    protocol: if protocol.is_migrated {
                        "PumpSwap"
                    } else {
                        "PumpFun"
                    }
                    .to_string(),
                    slot: None,
                    submitted_by: self.account_id.clone(),
                    request_amount_lamports: None,
                    request_amount_microtokens: Some(result.tokens_in),
                    result_amount_lamports: Some(0),
                    result_amount_microtokens: Some(0),
                    status: "FAILED".to_string(),
                    metadata,
                });

                let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                    order_id: result.order_id,
                    level: "warn".to_string(),
                    message: format!(
                        "Countersell failed: error: {}",
                        result.error.unwrap_or_default()
                    ),
                });

                // increment failure counter and check against threshold
                self.consecutive_failures += 1;
                if self.consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                    error!(
                        trade_id = %self.id,
                        failures = self.consecutive_failures,
                        "max consecutive failures reached; cancelling trade."
                    );

                    // cancel all remaining orders in the database
                    let mut orders = self.orders.write().await;
                    for order in orders.iter() {
                        let _ = self.hermes_sender.send(HermesCommand::UpdateOrderStatus {
                            order_id: order.params.order_id.clone(),
                            status: "CANCELLED".to_string(),
                        });
                        let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                            order_id: order.params.order_id.clone(),
                            level: "error".to_string(),
                            message: "Trade cancelled due to excessive transaction failures."
                                .to_string(),
                        });
                    }
                    orders.clear();

                    // set the trade's state to complete, triggering its shutdown
                    *self.is_complete.write().await = true;
                    return Ok(());
                }

                // after reverting pending counts, check if the wallet is empty
                let total_sold = *self.total_microtokens_sold.read().await;
                if total_sold >= self.initial_holdings_microtokens {
                    // if so, mark trade as complete and cancel any remaining orders
                    warn!(trade_id = %self.id, "wallet exhausted after failed tx; marking trade as complete");
                    *self.is_complete.write().await = true;
                    let mut orders = self.orders.write().await;
                    if !orders.is_empty() {
                        warn!(
                            trade_id = %self.id,
                            "cancelling {} remaining orders",
                            orders.len()
                        );
                        for order in orders.iter() {
                            let _ = self.hermes_sender.send(HermesCommand::UpdateOrderStatus {
                                order_id: order.params.order_id.clone(),
                                status: "CANCELLED".to_string(),
                            });
                        }
                        orders.clear();
                    }
                }
            }
            // a 'submitted' stage requires no action, we wait for 'confirmed' or 'failed'
            ExecutionStage::Submitted => {}
        }

        Ok(())
    }

    /*
        add_order
        ------------
        - adds a new order to the in-memory vector
        - updates the order's status in the database
        - marks the trade complete if no orders are left
    */
    async fn add_order(&mut self, order: OrderParameters) -> Result<()> {
        let mut orders = self.orders.write().await;
        if orders.len() >= 4 {
            let error_message = format!(
                "Maximum number of orders already reached; ignoring new order {}",
                order.order_id
            );
            warn!(
                trade_id = %self.id,
                order_id = %order.order_id,
                "maximum number of orders already reached; ignoring new order"
            );
            let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                order_id: order.order_id.clone(),
                level: "warn".to_string(),
                message: error_message.clone(),
            });
            return Err(anyhow::anyhow!(error_message));
        }

        // set the new order as active in the database and log its creation
        let _ = self.hermes_sender.send(HermesCommand::UpdateOrderStatus {
            order_id: order.order_id.clone(),
            status: "ACTIVE".to_string(),
        });

        let _ = self.hermes_sender.send(HermesCommand::LogOrder {
            order_id: order.order_id.clone(),
            level: "info".to_string(),
            message: format!(
                "Created new Countersell order; monitoring token {}",
                self.token_to_monitor,
            ),
        });

        orders.push(OrderState {
            params: order,
            microtokens_sold: 0,
            microtokens_pending: 0,
        });

        info!(trade_id = %self.id, new_order_count = orders.len(), "added new order");
        Ok(())
    }

    /*
        remove_order
        ------------
        - removes an order from the in-memory vector
        - updates the order's status in the database
        - marks the trade complete if no orders are left
    */
    async fn remove_order(&mut self, order_id: &str) -> Result<()> {
        // write lock on orders to remove the order
        let mut orders = self.orders.write().await;
        let initial_len = orders.len();
        orders.retain(|o| o.params.order_id != order_id);

        // first check if the order was found and removed
        if orders.len() < initial_len {
            info!(trade_id = %self.id, order_id = %order_id, "successfully removed order");

            // then update the order's status in the database
            let _ = self.hermes_sender.send(HermesCommand::UpdateOrderStatus {
                order_id: order_id.to_string(),
                status: "CANCELLED".to_string(),
            });

            // finally, if no orders are left, mark the trade as complete
            if orders.is_empty() {
                info!(trade_id = %self.id, "all orders removed, marking trade as complete");
                *self.is_complete.write().await = true;
            }
        } else {
            // if the order was not found, log a warning but handle gracefully
            warn!(trade_id = %self.id, order_id = %order_id, "could not find order to remove");
        }

        Ok(())
    }

    async fn cleanup(
        &mut self,
        shylock_sender: &mpsc::UnboundedSender<ShylockCommand>,
    ) -> Result<()> {
        info!(trade_id = %self.id, "cleaning up countersell trade");
        let _ = shylock_sender.send(ShylockCommand::DeregisterToken {
            mint: self.token_to_monitor,
        });
        Ok(())
    }
}
