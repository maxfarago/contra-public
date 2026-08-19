use crate::{
    types::{CreateOrderCommand, DeleteOrderCommand},
    Janus,
};
use anyhow::Result;
use commons::contracts::BuffettCommand;
use tracing::info;

impl Janus {
    pub(crate) async fn handle_create_order(&self, cmd: CreateOrderCommand) -> Result<()> {
        info!("received create order command, forwarding as trade to buffett");
        // translate the new "order" into the existing internal "trade" command
        self.buffett_sender.send(BuffettCommand::CreateTrade {
            trade_config: cmd.config,
        })?;
        Ok(())
    }

    pub(crate) async fn handle_delete_order(&self, cmd: DeleteOrderCommand) -> Result<()> {
        info!("received delete order command, constructing trade_id and forwarding to buffett");

        // a countersell trade id is a composite key, e.g., "countersell-wallet-mint"
        let trade_id = format!(
            "{}-{}-{}",
            cmd.order_type.to_lowercase(),
            cmd.wallet_public_key,
            cmd.token_mint
        );

        self.buffett_sender.send(BuffettCommand::RemoveOrder {
            trade_id,
            order_id: cmd.order_id,
        })?;
        Ok(())
    }
}
