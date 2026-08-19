use crate::types::RollupResult;
use anyhow::Result;
use commons::contracts::HermesCommand;
use tracing::{debug, info, trace};

use super::Countersell;

impl Countersell {
    // finds any orders triggered by the aggregated tx result
    pub(super) async fn get_triggered_orders(&self, result: &RollupResult) -> Result<Vec<String>> {
        // early exit if the tx was not a net buy
        if result.net_sol_lamports <= 0 {
            trace!(trade_id = %self.id, "ignoring non-net-buy transaction");
            return Ok(Vec::new());
        }

        // check each order's parameters against the net results of the tx
        let orders = self.orders.read().await;
        let mut triggered_ids = Vec::new();
        for order in orders.iter() {
            let p = &order.params;

            // skip orders that are already complete
            if (order.microtokens_sold + order.microtokens_pending) >= p.max_to_sell_microtokens {
                continue;
            }

            // condition 1: market cap threshold
            if result.final_market_cap_lamports < p.mcap_threshold_lamports as u128 {
                trace!(
                    trade_id = %self.id,
                    order_id = %p.order_id,
                    "market cap threshold not met (final: {}, required: {})",
                    result.final_market_cap_lamports,
                    p.mcap_threshold_lamports
                );
            // condition 2: net buy threshold
            } else if result.net_sol_lamports < p.buy_threshold_lamports as i64 {
                debug!(
                    trade_id = %self.id,
                    order_id = %p.order_id,
                    "net buy threshold not met (detected: {}, required: {})",
                    result.net_sol_lamports,
                    p.buy_threshold_lamports
                );
            } else {
                // if both conditions are met, the order is triggered
                info!(
                    trade_id = %self.id,
                    order_id = %p.order_id,
                    triggering_signature = %result.final_signature,
                    "Countersell order triggered! (final market cap: {} lamports; net buy size: {} lamports)",
                    result.final_market_cap_lamports,
                    result.net_sol_lamports
                );
                let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                    order_id: p.order_id.clone(),
                    level: "info".to_string(),
                    message: format!(
                            "Order triggered by net buy of {} lamports; final market cap: {} lamports; signature: {}",
                            result.net_sol_lamports, result.final_market_cap_lamports, result.final_signature
                        ),
                });
                triggered_ids.push(p.order_id.clone());
            }
        }
        Ok(triggered_ids)
    }
}
