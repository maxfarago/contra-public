use super::Countersell;
use crate::{
    price_calculator,
    pumpfun_events::{parse_pumpfun_complete_event, parse_pumpfun_trade_event},
    pumpswap_events::{
        parse_pumpswap_buy_event, parse_pumpswap_create_event, parse_pumpswap_sell_event,
    },
    types::{PumpLog, RollupResult, RollupResultType},
    Trade,
};
use commons::chain::{MigrationData, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID};
use commons::types::Protocol;
use solana_sdk::pubkey::Pubkey;
use tracing::{debug, trace};

impl Countersell {
    pub(super) async fn parse_events_from_logs(
        &self,
        logs: &[PumpLog],
    ) -> anyhow::Result<Vec<RollupResult>> {
        // create an empty vector to store the results
        let mut results = Vec::new();

        // get total token supply to calculate mcap for trade events
        let total_supply = match self.cached_token_total_supply {
            Some(ts) => ts,
            None => {
                trace!(trade_id = %self.id, "skipping log parsing, total supply not cached");
                return Ok(results);
            }
        };

        // iterate thru logs, sniffing for IDL discriminators of important events
        for log in logs {
            // 1. migration event (PumpSwap - CreatePoolEvent)
            if let Some(event) = parse_pumpswap_create_event(&log.raw_data) {
                // always double check that this is our token
                if event.base_mint == self.monitored_token() {
                    debug!(trade_id = %self.id, "parsing create pool event (migration completed)");

                    // derive the pool's token vault addresses from the event data
                    let associated_token_program_id =
                        ASSOCIATED_TOKEN_PROGRAM_ID.parse::<Pubkey>()?;
                    let token_program_id = TOKEN_PROGRAM_ID.parse::<Pubkey>()?;
                    let (pool_base_token_account, _) = Pubkey::find_program_address(
                        &[
                            &event.pool.to_bytes(),
                            &token_program_id.to_bytes(),
                            &event.base_mint.to_bytes(),
                        ],
                        &associated_token_program_id,
                    );
                    let (pool_quote_token_account, _) = Pubkey::find_program_address(
                        &[
                            &event.pool.to_bytes(),
                            &token_program_id.to_bytes(),
                            &event.quote_mint.to_bytes(),
                        ],
                        &associated_token_program_id,
                    );

                    results.push(RollupResult {
                        result_type: RollupResultType::Migrated,
                        protocol: Protocol::PumpSwap,
                        net_sol_lamports: 0,
                        final_market_cap_lamports: 0,
                        final_reserves: (0, 0),
                        final_signature: log.signature.clone(),
                        migration_data: Some(MigrationData {
                            pool_address: event.pool,
                            pool_base_token_account,
                            pool_quote_token_account,
                            pool_creator: event.creator,
                            coin_creator: event.coin_creator,
                        }),
                    });
                    continue; // Continue to the next log
                }
            }

            // 2. completion event (PumpFun - CompleteEvent)
            if let Some(event) = parse_pumpfun_complete_event(&log.raw_data) {
                // always double check that this is our token
                if event.mint == self.monitored_token() {
                    debug!(trade_id = %self.id, "parsing complete event (bonding curve completed)");
                    results.push(RollupResult {
                        result_type: RollupResultType::Completed,
                        protocol: Protocol::PumpFun,
                        net_sol_lamports: 0,
                        final_market_cap_lamports: 0,
                        final_reserves: (0, 0),
                        final_signature: log.signature.clone(),
                        migration_data: None,
                    });
                    continue;
                }
            }

            // 3. trade event (PumpFun - TradeEvent)
            if let Some(event) = parse_pumpfun_trade_event(&log.raw_data) {
                if event.mint == self.monitored_token() {
                    debug!(trade_id = %self.id, "parsing pump.fun trade event");
                    let market_cap = price_calculator::market_cap_pumpfun(
                        event.virtual_sol_reserves,
                        event.virtual_token_reserves,
                        total_supply,
                    );
                    results.push(RollupResult {
                        result_type: RollupResultType::Trade,
                        protocol: Protocol::PumpFun,
                        net_sol_lamports: if event.is_buy {
                            event.sol_amount as i64
                        } else {
                            -(event.sol_amount as i64)
                        },
                        final_market_cap_lamports: market_cap,
                        final_reserves: (event.virtual_sol_reserves, event.virtual_token_reserves),
                        final_signature: log.signature.clone(),
                        migration_data: None,
                    });
                    continue;
                }
            }

            // 4. buy event (PumpSwap - BuyEvent)
            if let Some(event) = parse_pumpswap_buy_event(&log.raw_data) {
                let context = self.get_token_context().await.unwrap();
                // always double check that this is our token
                if Some(event.pool) == context.pool {
                    debug!(trade_id = %self.id, "parsing pumpswap buy event");
                    let market_cap = price_calculator::market_cap_pumpswap(
                        event.pool_quote_token_reserves,
                        event.pool_base_token_reserves,
                        total_supply,
                    );
                    results.push(RollupResult {
                        result_type: RollupResultType::Trade,
                        protocol: Protocol::PumpSwap,
                        net_sol_lamports: event.quote_amount_in as i64,
                        final_market_cap_lamports: market_cap,
                        final_reserves: (
                            event.pool_quote_token_reserves,
                            event.pool_base_token_reserves,
                        ),
                        final_signature: log.signature.clone(),
                        migration_data: None,
                    });
                    continue;
                }
            }

            // 5. sell event (PumpSwap - SellEvent)
            if let Some(event) = parse_pumpswap_sell_event(&log.raw_data) {
                let context = self.get_token_context().await.unwrap();
                // always double check that this is our token
                if Some(event.pool) == context.pool {
                    debug!(trade_id = %self.id, "parsing pumpswap sell event");
                    let market_cap = price_calculator::market_cap_pumpswap(
                        event.pool_quote_token_reserves,
                        event.pool_base_token_reserves,
                        total_supply,
                    );
                    results.push(RollupResult {
                        result_type: RollupResultType::Trade,
                        protocol: Protocol::PumpSwap,
                        net_sol_lamports: -(event.quote_amount_out as i64),
                        final_market_cap_lamports: market_cap,
                        final_reserves: (
                            event.pool_quote_token_reserves,
                            event.pool_base_token_reserves,
                        ),
                        final_signature: log.signature.clone(),
                        migration_data: None,
                    });
                    continue;
                }
            }
        }
        Ok(results)
    }
}
