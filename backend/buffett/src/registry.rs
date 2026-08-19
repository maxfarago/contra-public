use anyhow::{anyhow, Result};
use commons::{
    contracts::{
        ActorMailbox, BuffettCommand, CountersellConfig, HermesCommand, OneShotBuyConfig,
        OneShotSellConfig, OrderParameters, ShylockCommand,
    },
    types::TokenContext,
};
use trades::{
    actor::TradeActor,
    examples::{Countersell, OneShotBuy, OneShotSell},
    protocol_detector::ProtocolDetector,
    TokenStateCache, Trade,
};

use serde_json::Value;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{info, warn};

/// A private struct to hold all metadata for a running trade actor.
#[derive(Clone)]
pub struct TradeInfo {
    pub mailbox_sender: mpsc::UnboundedSender<ActorMailbox>,
    monitored_token: Pubkey,
    token_context: TokenContext,
    wallet_pubkey: Pubkey,
}

/// The return value for a deregistered trade, providing context to the caller.
pub struct DeregisteredTradeInfo {
    pub token_context: TokenContext,
    pub wallet_pubkey: Pubkey,
}

#[derive(Clone)]
pub struct TradeRegistry {
    actors: Arc<RwLock<HashMap<String, TradeInfo>>>,
    market_subscriptions: Arc<RwLock<HashMap<Pubkey, Vec<String>>>>,
}

impl TradeRegistry {
    pub fn new() -> Self {
        Self {
            actors: Arc::new(RwLock::new(HashMap::new())),
            market_subscriptions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn is_signer_in_use(&self, wallet_key: &Pubkey) -> bool {
        let actors = self.actors.read().await;
        for trade_info in actors.values() {
            if &trade_info.wallet_pubkey == wallet_key {
                return true; // Found an active trade using this key
            }
        }
        false // No active trades are using this key
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn register(
        &self,
        trade_id: String,
        config: Value,
        rpc_client: Arc<RpcClient>,
        state_cache: TokenStateCache,
        hermes_sender: mpsc::UnboundedSender<HermesCommand>,
        buffett_command_sender: mpsc::UnboundedSender<BuffettCommand>,
        shylock_command_sender: mpsc::UnboundedSender<ShylockCommand>,
    ) -> Result<(TokenContext, Pubkey)> {
        // Build the trade object to get its context and metadata before spawning the actor.
        let trade = self
            .build_trade(
                trade_id.clone(),
                &config,
                rpc_client.clone(),
                state_cache,
                hermes_sender,
                shylock_command_sender.clone(),
            )
            .await?;

        let monitored_token = trade.monitored_token();
        let token_context = trade
            .get_token_context()
            .await
            .ok_or_else(|| anyhow!("trade is missing required token context"))?;
        let wallet_pubkey = trade
            .get_wallet_pubkey()
            .ok_or_else(|| anyhow!("trade is missing required wallet pubkey"))?;

        // 1. Create the actor's single input channel (its mailbox).
        let (mailbox_sender, mailbox_receiver) = mpsc::unbounded_channel::<ActorMailbox>();

        // 2. Create the actor using the correct constructor.
        let actor = TradeActor::new(
            trade,
            buffett_command_sender, // Give it the channel to talk back to Buffett.
            shylock_command_sender,
        );

        // 3. Spawn the actor's main loop, passing in the receiving end of its mailbox.
        tokio::spawn(actor.run(mailbox_receiver));
        info!(id = %trade_id, "spawned new trade actor");

        // 4. Store the sending half of the mailbox so Buffett can send messages to the actor.
        let info = TradeInfo {
            mailbox_sender,
            monitored_token,
            token_context: token_context.clone(),
            wallet_pubkey,
        };

        // Acquire write locks and update the registry state.
        let mut actors = self.actors.write().await;
        let mut subs = self.market_subscriptions.write().await;

        actors.insert(trade_id.clone(), info);
        subs.entry(monitored_token).or_default().push(trade_id);

        Ok((token_context, wallet_pubkey))
    }

    pub async fn deregister(&self, trade_id: &str) -> Option<DeregisteredTradeInfo> {
        let mut actors = self.actors.write().await;
        if let Some(info) = actors.remove(trade_id) {
            let mut subs = self.market_subscriptions.write().await;
            if let Some(sub_vec) = subs.get_mut(&info.monitored_token) {
                sub_vec.retain(|id| id != trade_id);
            }
            // Dropping `info` closes the channel, terminating the actor.
            info!(id = %trade_id, "deregistered trade actor");
            return Some(DeregisteredTradeInfo {
                token_context: info.token_context,
                wallet_pubkey: info.wallet_pubkey,
            });
        }
        warn!(id = %trade_id, "could not find trade to deregister");
        None
    }

    pub async fn get_trade(&self, trade_id: &str) -> Option<TradeInfo> {
        self.actors.read().await.get(trade_id).cloned()
    }

    pub async fn get_subscribers(
        &self,
        market_key: &Pubkey,
    ) -> Vec<mpsc::UnboundedSender<ActorMailbox>> {
        let subs = self.market_subscriptions.read().await;
        let trade_ids = if let Some(ids) = subs.get(market_key) {
            ids.clone()
        } else {
            return Vec::new();
        };

        let actors = self.actors.read().await;
        trade_ids
            .iter()
            .filter_map(|id| actors.get(id).map(|info| info.mailbox_sender.clone()))
            .collect()
    }

    // This is the trade-building logic moved from the old handlers.rs
    #[allow(clippy::too_many_arguments)]
    async fn build_trade(
        &self,
        trade_id: String,
        config: &Value,
        rpc_client: Arc<RpcClient>,
        state_cache: TokenStateCache,
        hermes_sender: mpsc::UnboundedSender<HermesCommand>,
        shylock_command_sender: mpsc::UnboundedSender<ShylockCommand>,
    ) -> Result<Box<dyn Trade>> {
        let order_type = config["order_type"]
            .as_str()
            .ok_or_else(|| anyhow!("config missing 'order_type'"))?;

        match order_type {
            "Countersell" => {
                let cs_config: CountersellConfig = serde_json::from_value(config.clone())?;
                let token_pubkey = cs_config.token_to_monitor.parse::<Pubkey>()?;
                let wallet_pubkey = cs_config.wallet_public_key.parse::<Pubkey>()?;

                let detector = ProtocolDetector::new(rpc_client.clone());
                let token_context = detector.detect_token_protocol(&token_pubkey).await?;

                // adapt the flat config to the Vec<OrderParameters> the constructor expects.
                let orders = vec![OrderParameters {
                    order_id: cs_config.order_id,
                    max_to_sell_microtokens: cs_config.max_to_sell_microtokens,
                    mcap_threshold_lamports: cs_config.mcap_threshold_lamports,
                    buy_threshold_lamports: cs_config.buy_threshold_lamports,
                    sell_pct_bps: cs_config.sell_pct_bps,
                }];

                let countersell_trade = Box::new(Countersell::new(
                    trade_id,
                    cs_config.account_id,
                    token_pubkey,
                    wallet_pubkey,
                    cs_config.wallet_private_key_encrypted,
                    orders,
                    cs_config.initial_holdings_microtokens,
                    state_cache,
                    hermes_sender,
                    shylock_command_sender,
                    token_context,
                ));
                Ok(countersell_trade)
            }
            "OneShotBuy" => {
                let osb_config: OneShotBuyConfig = serde_json::from_value(config.clone())?;
                let token_pubkey = osb_config.token_to_buy.parse::<Pubkey>()?;
                let wallet_pubkey = osb_config.wallet_public_key.parse::<Pubkey>()?;

                let detector = ProtocolDetector::new(rpc_client.clone());
                let token_context = detector.detect_token_protocol(&token_pubkey).await?;

                let oneshot_buy_trade = Box::new(OneShotBuy::new(
                    trade_id,
                    osb_config.account_id,
                    token_pubkey,
                    wallet_pubkey,
                    osb_config.wallet_private_key_encrypted,
                    osb_config.sol_amount,
                    osb_config.slippage_bps,
                    token_context,
                    hermes_sender,
                    shylock_command_sender,
                ));
                Ok(oneshot_buy_trade)
            }
            "OneShotSell" => {
                let oss_config: OneShotSellConfig = serde_json::from_value(config.clone())?;
                let token_pubkey = oss_config.token_to_sell.parse::<Pubkey>()?;
                let wallet_pubkey = oss_config.wallet_public_key.parse::<Pubkey>()?;

                let detector = ProtocolDetector::new(rpc_client.clone());
                let token_context = detector.detect_token_protocol(&token_pubkey).await?;

                let oneshot_sell_trade = Box::new(OneShotSell::new(
                    trade_id,
                    oss_config.account_id,
                    token_pubkey,
                    wallet_pubkey,
                    oss_config.wallet_private_key_encrypted,
                    oss_config.token_amount,
                    oss_config.slippage_bps,
                    token_context,
                    hermes_sender,
                    shylock_command_sender,
                ));
                Ok(oneshot_sell_trade)
            }
            _ => Err(anyhow!("unknown trade type: {}", order_type)),
        }
    }
}
