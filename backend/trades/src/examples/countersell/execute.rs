use super::{Countersell, COUNTERSELL_CU_LIMIT};
use crate::{price_calculator, types::RollupResult};
use anyhow::anyhow;
use commons::{
    contracts::{ExecutionOrder, HermesCommand},
    types::Protocol,
};
use solana_sdk::native_token::LAMPORTS_PER_SOL;
use tracing::{debug, info, warn};

impl Countersell {
    // given triggered orders and a net result, generates execution orders
    pub(super) async fn issue_warrant(
        &self,
        order_ids: Vec<String>,
        result: &RollupResult,
    ) -> anyhow::Result<Option<ExecutionOrder>> {
        // early exit if there are no triggered orders
        if order_ids.is_empty() {
            return Ok(None);
        }

        // sort triggered orders to find the highest priority one
        let sorted_triggered_orders = {
            let orders = self.orders.read().await;
            let mut sorted_orders = order_ids
                .iter()
                .filter_map(|id| {
                    orders
                        .iter()
                        .find(|o| o.params.order_id == *id)
                        .map(|o| (id.clone(), o.params.mcap_threshold_lamports))
                })
                .collect::<Vec<_>>();
            sorted_orders.sort_by(|a, b| a.1.cmp(&b.1));
            sorted_orders
        };

        // rule: only execute the highest-priority order per transaction
        if let Some((order_id, _)) = sorted_triggered_orders.first() {
            let mut orders = self.orders.write().await;
            if let Some(order) = orders.iter_mut().find(|o| o.params.order_id == *order_id) {
                debug!(
                    order_id = %order_id,
                    "selected as highest-priority triggered order to execute"
                );

                /*
                    countersell logic
                    -----------------
                    calculate the countersell amount in SOL (`ideal sell amount`)
                    = triggering net buy result * countersell percentage
                */
                let ideal_sell_amount_lamports = ((result.net_sol_lamports as i128
                    * order.params.sell_pct_bps as i128)
                    / 10000) as u64;

                debug!(
                    order_id = %order_id,
                    "triggering net buy amount: {}; countersell percentage: {}; target sell amount for order: {}",
                    result.net_sol_lamports, order.params.sell_pct_bps, ideal_sell_amount_lamports
                );

                /*
                    countersell logic
                    -----------------
                    calculate # of tokens in the ideal sell amount (`ideal tokens to sell`)
                    = ideal sell amount * protocol-specific function
                */
                let ideal_tokens_to_sell = match result.protocol {
                    Protocol::PumpFun => price_calculator::tokens_for_sol_pumpfun_sell(
                        ideal_sell_amount_lamports,
                        result.final_reserves.0,
                        result.final_reserves.1,
                    ),
                    Protocol::PumpSwap => price_calculator::tokens_for_sol_pumpswap_sell(
                        ideal_sell_amount_lamports,
                        result.final_reserves.0,
                        result.final_reserves.1,
                    ),
                };

                /*
                    countersell logic
                    -----------------
                    calculate # of tokens left in the order (`remaining tokens in order`)
                    = max to sell for order - (total sold for order + total pending for order)
                */
                let remaining_tokens_in_order = order
                    .params
                    .max_to_sell_microtokens
                    .saturating_sub(order.microtokens_sold + order.microtokens_pending);

                /*
                    countersell logic
                    -----------------
                    determine the final # of tokens to sell by applying caps:
                    1. cap by the order's remaining token limit
                    2. cap by the wallet's remaining token limit
                */
                let mut actual_tokens_to_sell = ideal_tokens_to_sell;
                let mut cap_reason = "";

                if remaining_tokens_in_order < actual_tokens_to_sell {
                    actual_tokens_to_sell = remaining_tokens_in_order;
                    cap_reason = "order's remaining token limit";
                }

                let total_sold_snapshot = *self.total_microtokens_sold.read().await;
                let total_pending_snapshot = *self.total_microtokens_pending.read().await;
                let wallet_tokens_remaining = self
                    .initial_holdings_microtokens
                    .saturating_sub(total_sold_snapshot + total_pending_snapshot);

                if wallet_tokens_remaining < actual_tokens_to_sell {
                    actual_tokens_to_sell = wallet_tokens_remaining;
                    cap_reason = "wallet's remaining token balance";
                }

                // early exit if no tokens can be sold for any reason
                if actual_tokens_to_sell == 0 {
                    warn!(
                        order_id = %order_id,
                        reason = if remaining_tokens_in_order == 0 { "order exhausted" } else { "wallet exhausted" },
                        "no tokens available to sell; skipping countersell execution"
                    );
                    let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                        order_id: order.params.order_id.clone(),
                        level: "warn".to_string(),
                        message: format!(
                            "No tokens available to sell; skipping execution. Reason: {}.",
                            if remaining_tokens_in_order == 0 {
                                "order exhausted"
                            } else {
                                "wallet exhausted"
                            }
                        ),
                    });
                    return Ok(None);
                }

                /*
                    countersell logic
                    -----------------
                    - determine the minimum acceptable SOL for the final token amount
                    - if the token amount was capped, log the reason and recalculate SOL
                */
                let min_acceptable_sol_lamports = if !cap_reason.is_empty() {
                    info!(
                        order_id = %order.params.order_id,
                        "countersell amount capped by {}; selling {} tokens",
                        cap_reason,
                        actual_tokens_to_sell
                    );
                    let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                        order_id: order.params.order_id.clone(),
                        level: "info".to_string(),
                        message: format!(
                            "Countersell amount capped by {}; selling {:.2} tokens",
                            cap_reason,
                            actual_tokens_to_sell as f64 / 1_000_000.0
                        ),
                    });

                    // if the token amount was capped, recalculate the expected SOL
                    let expected_sol_from_capped_amount = match result.protocol {
                        Protocol::PumpFun => price_calculator::sol_for_tokens_pumpfun_sell(
                            actual_tokens_to_sell,
                            result.final_reserves.0,
                            result.final_reserves.1,
                        ),
                        Protocol::PumpSwap => price_calculator::sol_for_tokens_pumpswap_sell(
                            actual_tokens_to_sell,
                            result.final_reserves.0,
                            result.final_reserves.1,
                        ),
                    };
                    expected_sol_from_capped_amount
                } else {
                    // if the ideal token amount wasn't capped, just use the ideal SOL amount
                    ideal_sell_amount_lamports
                };

                // early exit if no tokens to sell or no SOL expected
                if min_acceptable_sol_lamports == 0 {
                    warn!(
                        order_id = %order_id,
                        "skipping order with zero amount; tokens: {}; lamports: {}",
                        actual_tokens_to_sell, min_acceptable_sol_lamports
                    );
                    return Ok(None);
                }

                // incorporate default slippage buffer of 30%
                let min_acceptable_sol_lamports = (min_acceptable_sol_lamports as f64 * 0.7) as u64;

                // calculate the fee based on the minimum acceptable proceeds
                let fee_lamports = (min_acceptable_sol_lamports as u128 * 1 / 100) as u64;

                /*
                    countersell logic
                    -----------------
                    - log the final countersell parameters
                    - write the execution warrant to send to guillotine
                */
                debug!(
                    order_id = %order.params.order_id,
                    tokens_to_sell = actual_tokens_to_sell,
                    min_sol_output_f = min_acceptable_sol_lamports as f64 / LAMPORTS_PER_SOL as f64,
                    "calculated final countersell parameters"
                );
                let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                    order_id: order.params.order_id.clone(),
                    level: "debug".to_string(),
                    message: format!(
                        "Calculated final parameters. Tokens to sell: {}, Min acceptable SOL: {:.4}",
                        actual_tokens_to_sell,
                        min_acceptable_sol_lamports as f64 / LAMPORTS_PER_SOL as f64
                    ),
                });

                // write the execution warrant with the final parameters
                let warrant_to_issue = self
                    .write_countersell_warrant(
                        &order.params.order_id,
                        actual_tokens_to_sell,
                        min_acceptable_sol_lamports,
                        result.protocol.clone(),
                        fee_lamports,
                    )
                    .await
                    .map_err(|e| {
                        warn!(
                            order_id = %order_id,
                            "Failed to issue execution warrant: {:?}", e
                        );
                        let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                            order_id: order.params.order_id.clone(),
                            level: "warn".to_string(),
                            message: format!("Failed to issue execution warrant: {:?}", e),
                        });
                        e
                    })?;

                // update order's pending amount to prevent overselling
                order.microtokens_pending += actual_tokens_to_sell;

                // update total pending amount to prevent overselling
                let total_pending_now = {
                    let mut total_pending = self.total_microtokens_pending.write().await;
                    *total_pending += actual_tokens_to_sell;
                    *total_pending
                };
                debug!(
                    order_id = %order_id,
                    "added {} pending microtokens to prevent overselling; total pending: {}",
                    actual_tokens_to_sell,
                    total_pending_now
                );

                // return the countersell execution warrant to issue to guillotine
                return Ok(Some(warrant_to_issue));
            }
        }

        warn!(
            trade_id = %self.id,
            "no prioritized order to execute; skipping countersell execution"
        );
        Ok(None)
    }

    // builds a `sell` execution order for guillotine
    pub(super) async fn write_countersell_warrant(
        &self,
        order_id: &str,
        tokens_to_sell: u64,
        min_sol_output: u64,
        protocol: Protocol,
        fee_lamports: u64,
    ) -> anyhow::Result<ExecutionOrder> {
        let context = self.token_context.read().await;

        // build trade with common values + protocol-specific details
        let execution_warrant = ExecutionOrder {
            // --- core identifiers ---
            trade_id: self.id.clone(),
            order_id: order_id.to_string(),

            // --- wallet & signing ---
            wallet_pubkey: self.wallet_pubkey,
            private_key_encrypted: self.private_key_encrypted.clone(),

            // --- trade parameters ---
            is_buy: false,
            protocol,
            is_mayhem: context.is_mayhem,
            token_program_id: Some(context.token_program_id),
            token_mint: self.token_to_monitor,
            token_amount: tokens_to_sell,
            sol_amount: min_sol_output,
            fee_lamports,

            // --- execution strategy ---
            compute_unit_limit: Some(COUNTERSELL_CU_LIMIT),
            max_retries: Some(3),

            // --- protocol-specific accounts ---
            market_address: if protocol == Protocol::PumpFun {
                context.bonding_curve
            } else {
                context
                    .pool
                    .ok_or_else(|| anyhow!("pumpswap sell requires pool address in context"))?
            },

            // --- pump.fun specific accounts ---
            bonding_curve_creator: context.bonding_curve_creator,
            global_state: if protocol == Protocol::PumpFun {
                self.pumpfun_global_state.clone()
            } else {
                None
            },

            // --- pumpswap specific accounts ---
            pool_creator: context.pool_creator,
            coin_creator: context.coin_creator,
            pool_base_token_account: context.pool_base_token_account,
            pool_quote_token_account: context.pool_quote_token_account,
            global_config: if protocol == Protocol::PumpSwap {
                self.pumpswap_global_config.clone()
            } else {
                None
            },
        };

        debug!(order_id = %order_id, warrant = ?execution_warrant, "DEBUG: EXECUTION WARRANT");
        info!(
            order_id = %order_id,
            "execution warrant written for countersell transaction on protocol {:?}",
            protocol
        );

        Ok(execution_warrant)
    }
}
