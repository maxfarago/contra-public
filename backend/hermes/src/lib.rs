use anyhow::Result;
use commons::contracts::HermesCommand;
use sqlx::{query, PgPool};
use tokio::sync::mpsc;
use tracing::{debug, error, info, trace, warn};

// the hermes service is responsible for all database i/o
// it runs in a separate worker task to avoid blocking the trading logic
pub struct Hermes {
    db_pool: PgPool,
    hermes_receiver: mpsc::UnboundedReceiver<HermesCommand>,
}

impl Hermes {
    // creates a new instance of the hermes service
    pub fn new(
        db_pool: PgPool,
        hermes_receiver: mpsc::UnboundedReceiver<HermesCommand>,
    ) -> Result<Self> {
        Ok(Self {
            db_pool,
            hermes_receiver,
        })
    }

    // spawns the background worker task that listens for commands
    // on the mpsc channel and handles database i/o.
    pub fn start(mut self) {
        info!("starting hermes service...");
        tokio::spawn(async move {
            while let Some(command) = self.hermes_receiver.recv().await {
                // process the command and log any errors that occur
                // without crashing the worker task.
                if let Err(e) = self.handle_command(command).await {
                    error!(error = %e, "failed to process hermes command");
                }
            }
        });
    }

    /// routes the incoming command to the appropriate database handler.
    async fn handle_command(&self, command: HermesCommand) -> Result<()> {
        match command {
            HermesCommand::UpdateOrderStatus { order_id, status } => {
                let mut attempts = 0;
                loop {
                    attempts += 1;
                    let result = query(
                        "UPDATE position_order SET status = $1, updated_at = NOW() WHERE id = $2::uuid",
                    )
                    .bind(status.clone())
                    .bind(&order_id)
                    .execute(&self.db_pool)
                    .await?;

                    if result.rows_affected() > 0 {
                        info!(order_id = %order_id, "updated order status in db");
                        break;
                    } else if attempts >= 2 {
                        warn!(order_id = %order_id, "order not found in db after retry");
                        break;
                    } else {
                        // row not found on the first attempt, wait for the transaction to commit.
                        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                    }
                }
            }
            HermesCommand::Log { level, message } => {
                query("INSERT INTO log (level, message) VALUES ($1, $2)")
                    .bind(&level)
                    .bind(&message)
                    .execute(&self.db_pool)
                    .await?;
                trace!(level = %level, message = %message, "inserted generic log into db");
            }
            HermesCommand::LogOrder {
                order_id,
                level,
                message,
            } => {
                query("INSERT INTO log (order_id, level, message) VALUES ($1::uuid, $2, $3)")
                    .bind(&order_id)
                    .bind(level)
                    .bind(message)
                    .execute(&self.db_pool)
                    .await?;
                trace!(order_id = %order_id, "inserted order log into db");
            }
            HermesCommand::LogTransaction {
                signature,
                order_id,
                order_type,
                protocol,
                slot,
                submitted_by,
                request_amount_lamports,
                request_amount_microtokens,
                result_amount_lamports,
                result_amount_microtokens,
                status,
                metadata,
            } => {
                let query_str = "
                    INSERT INTO order_tx (
                        signature, order_id, type, protocol, slot, submitted_by,
                        request_amount_lamports, request_amount_microtokens,
                        result_amount_lamports, result_amount_microtokens,
                        status, metadata
                    ) VALUES ($1, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (signature) DO UPDATE SET
                        status = EXCLUDED.status,
                        slot = EXCLUDED.slot,
                        metadata = EXCLUDED.metadata,
                        result_amount_lamports = EXCLUDED.result_amount_lamports,
                        result_amount_microtokens = EXCLUDED.result_amount_microtokens,
                        confirmed_at = CASE WHEN EXCLUDED.status = 'CONFIRMED' THEN NOW() ELSE order_tx.confirmed_at END;
                ";

                query(query_str)
                    .bind(signature)
                    .bind(&order_id)
                    .bind(order_type)
                    .bind(protocol)
                    .bind(slot.map(|s| s as i64))
                    .bind(&submitted_by)
                    .bind(request_amount_lamports.map(|v| v as i64))
                    .bind(request_amount_microtokens.map(|v| v as i64))
                    .bind(result_amount_lamports)
                    .bind(result_amount_microtokens)
                    .bind(status)
                    .bind(metadata.unwrap_or(serde_json::json!({})))
                    .execute(&self.db_pool)
                    .await?;

                debug!(order_id = %order_id, "logged transaction to db");
            }
            HermesCommand::IncrementOrderAmounts {
                order_id,
                sol_amount_delta,
                token_amount_delta,
                set_as_complete,
            } => {
                let query_str = "
                    UPDATE position_order
                    SET
                        sol_amount_lamports = COALESCE(sol_amount_lamports, 0) + $1,
                        token_amount_microtokens = COALESCE(token_amount_microtokens, 0) + $2,
                        status = CASE WHEN $3 THEN 'COMPLETED' ELSE status END,
                        updated_at = NOW()
                    WHERE id = $4::uuid
                ";
                query(query_str)
                    .bind(sol_amount_delta)
                    .bind(token_amount_delta)
                    .bind(set_as_complete)
                    .bind(&order_id)
                    .execute(&self.db_pool)
                    .await?;
                info!(order_id = %order_id, "incremented order amounts in db");
            }
        }
        Ok(())
    }
}
