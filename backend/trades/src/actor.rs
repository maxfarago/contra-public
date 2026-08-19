use crate::Trade;
use commons::contracts::{ActorMailbox, BuffettCommand, ShylockCommand};
use tokio::sync::mpsc;
use tracing::{error, info};

pub struct TradeActor {
    trade: Box<dyn Trade>,
    buffett_command_sender: mpsc::UnboundedSender<BuffettCommand>,
    shylock_command_sender: mpsc::UnboundedSender<ShylockCommand>,
}

impl TradeActor {
    pub fn new(
        trade: Box<dyn Trade>,
        buffett_command_sender: mpsc::UnboundedSender<BuffettCommand>,
        shylock_command_sender: mpsc::UnboundedSender<ShylockCommand>,
    ) -> Self {
        Self {
            trade,
            buffett_command_sender,
            shylock_command_sender,
        }
    }

    pub async fn run(mut self, mut mailbox_receiver: mpsc::UnboundedReceiver<ActorMailbox>) {
        info!(id = %self.trade.id(), "starting trade actor");

        if let Err(e) = self.trade.initialize().await {
            error!(id = %self.trade.id(), error = %e, "error initializing trade");
            return;
        }

        if let Ok(Some(order)) = self.trade.activate().await {
            let command = BuffettCommand::ForwardExecutionOrder { order };
            if self.buffett_command_sender.send(command).is_err() {
                error!(trade_id = %self.trade.id(), "failed to send activation order to buffett");
            }
        }

        // check for completion after activation, in case the trade is immediately done
        if self.trade.is_complete() {
            info!(id = %self.trade.id(), "trade completed during activation, cleaning up...");
            if let Err(e) = self.trade.cleanup(&self.shylock_command_sender).await {
                error!(id = %self.trade.id(), error = %e, "error during trade cleanup");
            }
            return;
        }

        loop {
            tokio::select! {
                Some(message) = mailbox_receiver.recv() => {
                    match message {
                        ActorMailbox::TransactionLogs(logs) => {
                            if !self.trade.is_active().await {
                                continue;
                            }
                            if let Ok(Some(order)) = self.trade.process_logs(logs).await {
                                let command = BuffettCommand::ForwardExecutionOrder { order };
                                if self.buffett_command_sender.send(command).is_err() {
                                    error!(trade_id = %self.trade.id(), "failed to send execution order to buffett");
                                }
                            }
                        },
                        ActorMailbox::ExecutionResult(result) => {
                            if let Err(e) = self.trade.on_result(result).await {
                                error!(trade_id = %self.trade.id(), "error processing execution result: {:?}", e);
                            }
                        }
                        ActorMailbox::AddOrder(order) => {
                            if let Err(e) = self.trade.add_order(order).await {
                                error!(trade_id = %self.trade.id(), "error adding order: {:?}", e);
                            }
                        }
                        ActorMailbox::RemoveOrder { order_id } => {
                            if let Err(e) = self.trade.remove_order(&order_id).await {
                                error!(trade_id = %self.trade.id(), "error removing order: {:?}", e);
                            }
                        }
                    }

                    // after processing any message, check if the trade is now complete
                    if self.trade.is_complete() {
                        info!(id = %self.trade.id(), "trade has completed its lifecycle, breaking loop for cleanup...");
                        // notify buffett that we are done
                        let _ = self.buffett_command_sender.send(BuffettCommand::TradeComplete {
                            trade_id: self.trade.id().to_string(),
                        });
                        break; // exit the loop to shut down
                    }
                },
                else => {
                    info!(id = %self.trade.id(), "mailbox closed, shutting down trade actor.");
                    break;
                }
            }
        }

        info!(id = %self.trade.id(), "actor loop terminated, performing final cleanup...");
        if let Err(e) = self.trade.cleanup(&self.shylock_command_sender).await {
            error!(id = %self.trade.id(), error = %e, "error during trade cleanup");
        }

        info!(id = %self.trade.id(), "trade actor shut down gracefully.");
    }
}
