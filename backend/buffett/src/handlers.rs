use crate::Buffett;
use anyhow::{anyhow, Result};
use commons::contracts::{ActorMailbox, CountersellConfig, HermesCommand, OrderParameters};
use guillotine::WalletManagerCommand;
use serde_json::Value;
use tokio::sync::oneshot;
use tracing::{debug, error, info, warn};

impl Buffett {
    pub(crate) async fn handle_create_trade(&mut self, config: Value) -> Result<()> {
        let order_type = config["order_type"]
            .as_str()
            .ok_or_else(|| anyhow!("config missing 'order_type'"))?;

        // route to the correct handler based on order type
        match order_type {
            "Countersell" => self.handle_upsert_countersell(config).await,
            "OneShotBuy" | "OneShotSell" => self.handle_create_oneshot(config).await,
            _ => Err(anyhow!("unknown order type: {}", order_type)),
        }
    }

    async fn handle_upsert_countersell(&mut self, config: Value) -> Result<()> {
        let wallet_pk_str = config["wallet_public_key"]
            .as_str()
            .ok_or_else(|| anyhow!("countersell config missing 'wallet_public_key'"))?;
        let token_mint_str = config["token_to_monitor"]
            .as_str()
            .ok_or_else(|| anyhow!("countersell config missing 'token_to_monitor'"))?;

        // create the deterministic, composite order-group id
        let position_id = format!("countersell-{}-{}", wallet_pk_str, token_mint_str);

        let cs_config: CountersellConfig = serde_json::from_value(config.clone())?;
        let new_order = OrderParameters {
            order_id: cs_config.order_id,
            max_to_sell_microtokens: cs_config.max_to_sell_microtokens,
            mcap_threshold_lamports: cs_config.mcap_threshold_lamports,
            buy_threshold_lamports: cs_config.buy_threshold_lamports,
            sell_pct_bps: cs_config.sell_pct_bps,
        };

        if let Some(existing_trade) = self.registry.get_trade(&position_id).await {
            info!(id = %position_id, "found existing position, adding new order");
            let msg = ActorMailbox::AddOrder(new_order);
            if let Err(e) = existing_trade.mailbox_sender.send(msg) {
                error!(id = %position_id, "failed to send AddOrder command to actor: {}", e);
            }
        } else {
            info!(id = %position_id, "no existing trade found, creating new one");
            self.create_new_trade(position_id, config).await?;
        }

        Ok(())
    }

    async fn handle_create_oneshot(&mut self, config: Value) -> Result<()> {
        let order_id = config["order_id"]
            .as_str()
            .ok_or_else(|| anyhow!("oneshot config missing 'order_id'"))?
            .to_string();
        self.create_new_trade(order_id, config).await?;
        Ok(())
    }

    async fn create_new_trade(&mut self, trade_id: String, config: Value) -> Result<()> {
        if let Some(deregistered_info) = self.registry.deregister(&trade_id).await {
            info!(id = %trade_id, "removed existing trade for update");
            if let Some(pool) = deregistered_info.token_context.pool {
                self.pool_to_mint_map.entry(pool).and_modify(|e| e.1 -= 1);
                self.pool_to_mint_map.retain(|_, v| v.1 > 0);
            }
        }

        let (token_context, wallet_pubkey) = self
            .registry
            .register(
                trade_id.clone(),
                config.clone(),
                self.rpc_client.clone(),
                self.state_cache.clone(),
                self.hermes_sender.clone(),
                self.command_sender.clone(),
                self.shylock_command_sender.clone(),
            )
            .await?;

        if let Some(pool) = token_context.pool {
            self.pool_to_mint_map
                .entry(pool)
                .and_modify(|e| e.1 += 1)
                .or_insert((token_context.token_mint, 1));
        }

        let private_key_encrypted = self.get_encrypted_key(&config)?;
        let (tx, rx) = oneshot::channel();
        self.wallet_manager_sender
            .send(WalletManagerCommand::PrepareSigner {
                wallet_pubkey,
                private_key_encrypted,
                reply_channel: tx,
            })?;

        if let Err(e) = rx.await? {
            error!(id = %trade_id, error = %e, "failed to prepare signer, aborting trade creation");
            self.registry.deregister(&trade_id).await;
            return Err(e.into());
        }

        info!(id = %trade_id, "successfully created new trade actor");
        Ok(())
    }

    pub(crate) async fn handle_delete_trade(&mut self, trade_id: String) -> Result<()> {
        debug!(id = %trade_id, "processing delete command");

        if let Some(deregistered_info) = self.registry.deregister(&trade_id).await {
            info!(id = %trade_id, "successfully deregistered trade actor");

            if let Some(pool) = deregistered_info.token_context.pool {
                self.pool_to_mint_map.entry(pool).and_modify(|e| e.1 -= 1);
                self.pool_to_mint_map.retain(|_, v| v.1 > 0);
                debug!(pool = %pool, "decremented pool reference count");
            }

            let wallet_pubkey = deregistered_info.wallet_pubkey;
            if !self.registry.is_signer_in_use(&wallet_pubkey).await {
                debug!(wallet_pubkey = %wallet_pubkey, "issuing command to destroy signer");
                self.wallet_manager_sender
                    .send(WalletManagerCommand::DestroySigner { wallet_pubkey })?;
            } else {
                info!(wallet_pubkey = %wallet_pubkey, "signer still in use by other trades, skipping destruction");
            }

            debug!("successfully set status to disabled in db");
        } else {
            warn!(id = %trade_id, "could not find trade to disable");
        }
        Ok(())
    }

    pub(crate) async fn handle_trade_complete(&mut self, trade_id: String) -> Result<()> {
        debug!(id = %trade_id, "processing trade complete command");

        if let Some(deregistered_info) = self.registry.deregister(&trade_id).await {
            info!(id = %trade_id, "successfully deregistered trade actor");

            if let Some(pool) = deregistered_info.token_context.pool {
                self.pool_to_mint_map.entry(pool).and_modify(|e| e.1 -= 1);
                self.pool_to_mint_map.retain(|_, v| v.1 > 0);
                debug!(pool = %pool, "decremented pool reference count");
            }

            let wallet_pubkey = deregistered_info.wallet_pubkey;
            if !self.registry.is_signer_in_use(&wallet_pubkey).await {
                debug!(wallet_pubkey = %wallet_pubkey, "issuing command to destroy signer");
                self.wallet_manager_sender
                    .send(WalletManagerCommand::DestroySigner { wallet_pubkey })?;
            } else {
                info!(wallet_pubkey = %wallet_pubkey, "signer still in use by other trades, skipping destruction");
            }

            debug!("successfully set status to complete in db");
        } else {
            warn!(id = %trade_id, "could not find trade to mark as complete");
        }
        Ok(())
    }

    pub(crate) async fn handle_remove_order(
        &mut self,
        position_id: String,
        order_id: String,
    ) -> Result<()> {
        info!(position_id = %position_id, order_id = %order_id, "processing remove order command");

        if let Some(actor) = self.registry.get_trade(&position_id).await {
            // actor found, forward the command for it to handle gracefully.
            let msg = ActorMailbox::RemoveOrder { order_id };
            if let Err(e) = actor.mailbox_sender.send(msg) {
                error!(id = %position_id, "failed to send RemoveOrder command to actor: {}", e);
            } else {
                info!(position_id = %position_id, "successfully forwarded remove order command to trade actor");
            }
        } else {
            // actor not found. this could mean the trade is already complete or never started.
            // to be safe, directly update the order's status in the db to cancelled.
            warn!(position_id = %position_id, "could not find actor in registry. directly cancelling order in db.");
            let hermes_cmd = HermesCommand::UpdateOrderStatus {
                order_id,
                status: "DELETED".to_string(),
            };
            if let Err(e) = self.hermes_sender.send(hermes_cmd) {
                error!(position_id = %position_id, "failed to send cancel command to hermes: {}", e);
            }
        }

        Ok(())
    }

    fn get_encrypted_key(&self, config: &Value) -> Result<String> {
        #[derive(serde::Deserialize)]
        struct KeyHolder {
            wallet_private_key_encrypted: String,
        }
        let holder: KeyHolder = serde_json::from_value(config.clone())?;
        Ok(holder.wallet_private_key_encrypted)
    }
}
