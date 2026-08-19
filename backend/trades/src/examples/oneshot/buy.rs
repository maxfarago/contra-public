use crate::{price_calculator, Trade};
use commons::{
    contracts::{ExecutionOrder, ExecutionResult, HermesCommand, ShylockCommand, TransactionLogs},
    types::{ExecutionStage, Protocol, TokenContext},
};

use anyhow::{anyhow, Result};
use solana_sdk::pubkey::Pubkey;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::sync::{mpsc, oneshot};
use tracing::{info, warn};

pub struct OneShotBuy {
    pub order_id: String,
    pub account_id: String,
    pub token_to_buy: Pubkey,
    pub wallet_pubkey: Pubkey,
    pub private_key_encrypted: String,
    pub sol_amount: u64,
    pub slippage_bps: u16,

    // internal state management
    is_complete: Arc<AtomicBool>,
    token_context: Arc<tokio::sync::RwLock<TokenContext>>,
    hermes_sender: mpsc::UnboundedSender<HermesCommand>,
    shylock_sender: mpsc::UnboundedSender<ShylockCommand>,
}

impl OneShotBuy {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        order_id: String,
        account_id: String,
        token_to_buy: Pubkey,
        wallet_pubkey: Pubkey,
        private_key_encrypted: String,
        sol_amount: u64,
        slippage_bps: u16,
        token_context: TokenContext,
        hermes_sender: mpsc::UnboundedSender<HermesCommand>,
        shylock_sender: mpsc::UnboundedSender<ShylockCommand>,
    ) -> Self {
        Self {
            order_id,
            account_id,
            token_to_buy,
            wallet_pubkey,
            private_key_encrypted,
            sol_amount,
            slippage_bps,
            is_complete: Arc::new(AtomicBool::new(false)),
            token_context: Arc::new(tokio::sync::RwLock::new(token_context)),
            hermes_sender,
            shylock_sender,
        }
    }
}

#[async_trait::async_trait]
impl Trade for OneShotBuy {
    fn name(&self) -> &str {
        "OneShotBuy"
    }

    fn id(&self) -> &str {
        &self.order_id
    }

    fn monitored_token(&self) -> Pubkey {
        self.token_to_buy
    }

    async fn is_active(&self) -> bool {
        !self.is_complete()
    }

    fn get_wallet_pubkey(&self) -> Option<Pubkey> {
        Some(self.wallet_pubkey)
    }

    async fn get_token_context(&self) -> Option<TokenContext> {
        Some(self.token_context.read().await.clone())
    }

    // one-shot trades are proactive, not reactive to transaction logs.
    async fn process_logs(&mut self, _logs: TransactionLogs) -> Result<Option<ExecutionOrder>> {
        Ok(None)
    }

    async fn initialize(&mut self) -> Result<()> {
        // register token with shylock
        let (tx, rx) = oneshot::channel();
        let context = self.token_context.read().await.clone();
        self.shylock_sender
            .send(ShylockCommand::RegisterToken { context, reply: tx })?;

        // block until shylock confirms the token data is cached
        rx.await??;
        info!(order_id = %self.order_id, "successfully registered with shylock and cached token data");

        Ok(())
    }

    async fn activate(&mut self) -> Result<Option<ExecutionOrder>> {
        // check if already activated
        if self.is_complete.load(Ordering::SeqCst) {
            return Ok(None);
        }

        // first, get the latest on-chain data from shylock
        let (tx, rx) = oneshot::channel();
        self.shylock_sender.send(ShylockCommand::GetLiveTokenData {
            mint: self.token_to_buy,
            reply: tx,
        })?;
        let live_data = rx
            .await?
            .ok_or_else(|| anyhow!("could not get live token data from shylock"))?;

        // then, retrieve the token context
        let context = self.token_context.read().await;

        // determine protocol and market address
        let (protocol, market_address, expected_tokens_out, fee_lamports) = if !context.is_migrated
        {
            // --------------------
            // case 1: pump.fun buy
            // --------------------
            let pumpfun_data = live_data
                .pumpfun_data
                .as_ref()
                .ok_or_else(|| anyhow!("missing pumpfun data in shylock response"))?;
            let bc_data = &pumpfun_data.bonding_curve;
            let bonding_curve_pk = context.bonding_curve;

            // calculate the fee and remaining sol for the swap
            let fee_lamports = (self.sol_amount as u128 * 1 / 100) as u64;

            // calculate the expected tokens out using the pump.fun calculator
            let tokens_out = price_calculator::tokens_for_sol_pumpfun_buy(
                self.sol_amount,
                bc_data.virtual_sol_reserves,
                bc_data.virtual_token_reserves,
            );
            (
                Protocol::PumpFun,
                bonding_curve_pk,
                tokens_out,
                fee_lamports,
            )
        } else {
            // --------------------
            // case 2: pumpswap buy
            // --------------------
            let pumpswap_data = live_data
                .pumpswap_data
                .as_ref()
                .ok_or_else(|| anyhow!("missing pumpswap data in shylock response"))?;
            let pool_pk = context
                .pool
                .ok_or_else(|| anyhow!("pool not found for pumpswap buy"))?;

            // calculate the fee and remaining sol for the swap
            let fee_lamports = (self.sol_amount as u128 * 1 / 100) as u64;

            // calculate the expected tokens out using the pumpswap calculator
            let tokens_out = price_calculator::tokens_for_sol_pumpswap_buy(
                self.sol_amount,
                pumpswap_data.pool_quote_reserves,
                pumpswap_data.pool_base_reserves,
            );
            (Protocol::PumpSwap, pool_pk, tokens_out, fee_lamports)
        };

        // for a buy, slippage determines the maximum SOL we are willing to spend for n tokens
        // (where n tokens is the expected number of tokens for the user's requested SOL amount)
        let slippage_factor = 1.0 + (self.slippage_bps as f64 / 10000.0);
        let sol_with_slippage = (self.sol_amount as f64 * slippage_factor) as u64;

        info!(
            sol_in = self.sol_amount,
            protocol = ?protocol,
            expected_tokens_out = expected_tokens_out,
            "calculated buy parameters"
        );

        let execution_warrant = ExecutionOrder {
            // --- core identifiers ---
            trade_id: self.order_id.clone(),
            order_id: self.order_id.clone(),

            // --- wallet & signing ---
            wallet_pubkey: self.wallet_pubkey,
            private_key_encrypted: self.private_key_encrypted.clone(),

            // --- trade parameters ---
            is_buy: true,
            token_mint: self.token_to_buy,
            token_amount: expected_tokens_out,
            sol_amount: sol_with_slippage,
            fee_lamports,

            // --- execution strategy ---
            compute_unit_limit: Some(200_000),
            max_retries: Some(3),

            // --- protocol-agnostic ---
            protocol,
            market_address,
            is_mayhem: context.is_mayhem,
            token_program_id: Some(context.token_program_id),

            // --- pump.fun specific accounts ---
            bonding_curve_creator: context.bonding_curve_creator,
            global_state: if protocol == Protocol::PumpFun {
                live_data
                    .pumpfun_data
                    .as_ref()
                    .map(|d| d.global_state.clone())
            } else {
                None
            },

            // --- pumpswap specific accounts ---
            pool_creator: context.pool_creator,
            coin_creator: context.coin_creator,
            pool_base_token_account: context.pool_base_token_account,
            pool_quote_token_account: context.pool_quote_token_account,
            global_config: if protocol == Protocol::PumpSwap {
                live_data
                    .pumpswap_data
                    .as_ref()
                    .map(|d| d.global_config.clone())
            } else {
                None
            },
        };

        Ok(Some(execution_warrant))
    }

    async fn on_result(&mut self, result: ExecutionResult) -> Result<()> {
        // check the execution result's status to determine the next step
        match result.stage {
            // SUCCESSFUL execution (w00t!)
            ExecutionStage::Confirmed => {
                info!(order_id = %self.order_id, "received confirmed execution result");

                // mark as complete now that we have a terminal result
                self.is_complete.store(true, Ordering::SeqCst);

                info!(order_id = %self.order_id, "received confirmed execution result");
                let signature_str = result.signature.ok_or_else(|| {
                    anyhow!(
                        "confirmed execution result for order {} is missing a signature",
                        self.order_id
                    )
                })?;

                info!(order_id = %self.order_id, "fetching confirmed transaction to parse final amounts");
                let (tx_reply, rx_reply) = oneshot::channel();
                self.shylock_sender
                    .send(ShylockCommand::GetConfirmedTransaction {
                        signature: signature_str.clone(),
                        reply: tx_reply,
                    })?;
                let tx = rx_reply.await??;

                // extract slot and metadata before parsing the tx balance changes
                let slot = tx.slot;
                let metadata = tx
                    .transaction
                    .meta
                    .as_ref()
                    .and_then(|m| serde_json::to_value(m).ok());

                let context = self.token_context.read().await;
                let (sol_change, token_change) = rosetta::token_parser::parse_balance_changes(
                    tx,
                    &self.wallet_pubkey,
                    &context,
                )?;

                info!(order_id = %self.order_id, sol_change = sol_change, token_change = token_change, "parsed transaction balance changes");

                // log the transaction to order_tx
                let protocol = self.token_context.read().await;
                let _ = self.hermes_sender.send(HermesCommand::LogTransaction {
                    signature: signature_str,
                    order_id: self.order_id.clone(),
                    order_type: self.name().to_string(),
                    protocol: if protocol.is_migrated {
                        "PumpSwap"
                    } else {
                        "PumpFun"
                    }
                    .to_string(),
                    slot: Some(slot),
                    submitted_by: self.account_id.clone(),
                    request_amount_lamports: Some(self.sol_amount),
                    request_amount_microtokens: None,
                    result_amount_lamports: Some(sol_change),
                    result_amount_microtokens: Some(token_change),
                    status: "CONFIRMED".to_string(),
                    metadata,
                });

                // update order with final amounts
                let _ = self
                    .hermes_sender
                    .send(HermesCommand::IncrementOrderAmounts {
                        order_id: self.order_id.clone(),
                        sol_amount_delta: sol_change,
                        token_amount_delta: token_change,
                        set_as_complete: true,
                    });
            }
            // FAILED execution (oh noes)
            ExecutionStage::Failed => {
                warn!(order_id = %self.order_id, "received failed execution result");

                // mark as complete now that we have a terminal result
                self.is_complete.store(true, Ordering::SeqCst);

                // update order status to FAILED in db
                let _ = self.hermes_sender.send(HermesCommand::UpdateOrderStatus {
                    order_id: self.order_id.clone(),
                    status: "FAILED".to_string(),
                });

                // also log the failed transaction attempt itself
                let protocol = self.token_context.read().await;
                let metadata = result
                    .error
                    .clone()
                    .map(|e| serde_json::json!({ "error": e }));
                let _ = self.hermes_sender.send(HermesCommand::LogTransaction {
                    signature: result.signature.unwrap_or_else(|| "N/A".to_string()),
                    order_id: self.order_id.clone(),
                    order_type: self.name().to_string(),
                    protocol: if protocol.is_migrated {
                        "PumpSwap"
                    } else {
                        "PumpFun"
                    }
                    .to_string(),
                    slot: None,
                    submitted_by: self.account_id.clone(),
                    request_amount_lamports: Some(self.sol_amount),
                    request_amount_microtokens: None,
                    result_amount_lamports: Some(0),
                    result_amount_microtokens: Some(0),
                    status: "FAILED".to_string(),
                    metadata,
                });

                let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                    order_id: self.order_id.clone(),
                    level: "error".to_string(),
                    message: format!("one shot buy failed: {}", result.error.unwrap_or_default()),
                });
            }
            // SUBMITTED execution
            ExecutionStage::Submitted => { /* no-op, wait for a terminal result */ }
        }

        Ok(())
    }

    fn is_complete(&self) -> bool {
        self.is_complete.load(Ordering::SeqCst)
    }

    async fn cleanup(
        &mut self,
        shylock_sender: &mpsc::UnboundedSender<ShylockCommand>,
    ) -> Result<()> {
        info!(order_id = %self.order_id, "cleaning up one shot buy trade");
        let _ = shylock_sender.send(ShylockCommand::DeregisterToken {
            mint: self.token_to_buy,
        });
        Ok(())
    }

    // no-op (one-shot trades don't support orders)
    async fn add_order(&mut self, _order: commons::contracts::OrderParameters) -> Result<()> {
        Err(anyhow!("cannot add orders to a one-shot buy trade"))
    }

    // no-op (one-shot trades don't support orders)
    async fn remove_order(&mut self, _order_id: &str) -> Result<()> {
        Err(anyhow!("cannot remove orders from a one-shot buy trade"))
    }
}
