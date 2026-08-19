use super::{Countersell, RollupResult, RollupResultType};
use anyhow::Result;
use commons::contracts::HermesCommand;
use tracing::{debug, info, warn};

impl Countersell {
    /*
        handle_migration_event
        ----------------------
        - checks for a migration event in the parsed transaction logs
        - if a migration is found, updates the token context and logs the event
        - returns true if a migration was processed, false otherwise
    */
    pub(super) async fn handle_migration_event(
        &self,
        parsed_events: &[RollupResult],
    ) -> Result<bool> {
        for event in parsed_events {
            if event.result_type == RollupResultType::Migrated {
                if let Some(migration_data) = &event.migration_data {
                    info!(position_id = %self.id, "migration detected for token {}!", self.token_to_monitor);
                    let mut context = self.token_context.write().await;
                    if !context.is_migrated {
                        context.is_migrated = true;
                        context.pool = Some(migration_data.pool_address);
                        context.pool_base_token_account =
                            Some(migration_data.pool_base_token_account);
                        context.pool_quote_token_account =
                            Some(migration_data.pool_quote_token_account);
                        context.pool_creator = Some(migration_data.pool_creator);
                        context.coin_creator = Some(migration_data.coin_creator);
                        debug!(position_id = %self.id,
                            pool_address = %migration_data.pool_address,
                            pool_base_token_account = %migration_data.pool_base_token_account,
                            pool_quote_token_account = %migration_data.pool_quote_token_account,
                            "token context updated for migration");

                        let _ = self.hermes_sender.send(HermesCommand::Log {
                            level: "info".to_string(),
                            message: format!(
                                "Position {}: token migration to pumpswap detected; position state updated",
                                self.id
                            ),
                        });

                        // log the state update for each active order
                        let orders = self.orders.read().await;
                        for order in orders.iter() {
                            let _ = self.hermes_sender.send(HermesCommand::LogOrder {
                                order_id: order.params.order_id.clone(),
                                level: "info".to_string(),
                                message: format!(
                                    "Token {} migrated! Protocol changed to pumpswap",
                                    self.token_to_monitor
                                )
                                .to_string(),
                            });
                        }
                    }
                } else {
                    // no migration data found
                    warn!(position_id = %self.id, "migration event detected but no migration data found");
                    let _ = self.hermes_sender.send(HermesCommand::Log {
                        level: "warn".to_string(),
                        message: format!(
                            "Position {}: migration event detected but no migration data found",
                            self.id
                        ),
                    });
                }
                // stop after finding the first migration event
                return Ok(true);
            }
        }
        Ok(false)
    }
}
