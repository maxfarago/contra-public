use commons::{
    chain::{BondingCurve, FeeConfig, Global, GlobalConfig, Pool, PumpFunData, PumpSwapData},
    chain::{PUMPSWAP_GLOBAL_PUBKEY, PUMPSWAP_PROGRAM_ID, PUMP_GLOBAL_PUBKEY, PUMP_PROGRAM_ID},
    contracts::{CachedTokenData, HermesCommand, ShylockCommand},
    types::{Protocol, TokenContext},
};

use anyhow::{anyhow, Result};
use borsh::BorshDeserialize;
use reqwest::Client as HttpClient;
use serde_json::json;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, RwLock};
use tracing::{debug, error, info, trace, warn};

mod handlers;

const DEFAULT_PRIORITY_FEE_MICROLAMPORTS_PER_CU: u64 = 1_000_000;
const PUMP_FEES_PROGRAM_ID: &str = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";

pub struct Shylock {
    http_client: HttpClient,
    rpc_client: Arc<RpcClient>,

    // Main unified cache for all token-related data.
    token_cache: Arc<RwLock<HashMap<Pubkey, CachedTokenData>>>,

    // Reference counter for token subscriptions, retaining context for polling.
    token_subscriptions: Arc<RwLock<HashMap<Pubkey, (usize, TokenContext)>>>,

    // The single, unified command channel.
    command_receiver: mpsc::UnboundedReceiver<ShylockCommand>,
}

impl Shylock {
    pub fn new(
        rpc_url: String,
        rpc_api_key: String,
        _hermes_sender: mpsc::UnboundedSender<HermesCommand>,
        command_receiver: mpsc::UnboundedReceiver<ShylockCommand>,
    ) -> Self {
        let rpc_client = Arc::new(RpcClient::new(format!(
            "{}?api-key={}",
            rpc_url, rpc_api_key
        )));
        Self {
            http_client: HttpClient::new(),
            rpc_client,
            token_cache: Arc::new(RwLock::new(HashMap::new())),
            token_subscriptions: Arc::new(RwLock::new(HashMap::new())),
            command_receiver,
        }
    }

    pub async fn start(mut self) -> Result<()> {
        info!("starting shylock oracle service...");

        // Start the priority fee poller.
        self.start_dynamic_poller().await?;
        debug!("shylock priority fee poller spawned");

        // Main command loop.
        loop {
            tokio::select! {
                Some(command) = self.command_receiver.recv() => {
                    if let Err(e) = self.handle_command(command).await {
                        error!("error processing shylock command: {}", e);
                    }
                },
            }
        }
    }

    async fn start_dynamic_poller(&mut self) -> Result<()> {
        let http_client = self.http_client.clone();
        let rpc_url = self.rpc_client.url();
        let rpc_api_key = self
            .rpc_client
            .url()
            .split("api-key=")
            .last()
            .unwrap_or("")
            .to_string();
        let token_cache = self.token_cache.clone();
        let token_subscriptions = self.token_subscriptions.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(3));
            loop {
                interval.tick().await;

                let subs = token_subscriptions.read().await;
                if subs.is_empty() {
                    trace!("no tokens to poll for priority fees");
                    continue;
                }

                let mut token_accounts = HashMap::new();
                for (_, (count, context)) in subs.iter() {
                    if *count > 0 {
                        let mut accounts = vec![context.bonding_curve];
                        if let Some(pool) = context.pool {
                            accounts.push(pool);
                        }
                        token_accounts.insert(context.token_mint, accounts);
                    }
                }
                drop(subs);

                if let Ok(fees) = Self::poll_all_priority_fees(
                    &http_client,
                    &rpc_url,
                    &rpc_api_key,
                    &token_accounts,
                )
                .await
                {
                    let mut cache_writer = token_cache.write().await;
                    for (mint, fee) in fees {
                        if let Some(data) = cache_writer.get_mut(&mint) {
                            data.priority_fee = fee;
                        }
                    }
                }
            }
        });

        Ok(())
    }

    async fn poll_all_priority_fees(
        http_client: &HttpClient,
        rpc_url: &str,
        rpc_api_key: &str,
        token_accounts: &HashMap<Pubkey, Vec<Pubkey>>,
    ) -> Result<HashMap<Pubkey, u64>> {
        let mut batch_requests = Vec::new();
        let mut token_to_request_id = HashMap::new();

        for (token_mint, account_keys) in token_accounts {
            let request_id = batch_requests.len() as u64;
            token_to_request_id.insert(*token_mint, request_id);

            let account_keys_str: Vec<String> =
                account_keys.iter().map(|pk| pk.to_string()).collect();

            batch_requests.push(json!({
                "jsonrpc": "2.0",
                "id": request_id,
                "method": "getPriorityFeeEstimate",
                "params": [{
                    "accountKeys": account_keys_str
                }]
            }));
        }

        let url = format!("{}?api-key={}", rpc_url, rpc_api_key);
        let response = http_client.post(&url).json(&batch_requests).send().await?;

        let responses: Vec<serde_json::Value> = response.json().await?;
        let mut results = HashMap::new();

        for response in responses {
            if let (Some(id), Some(result)) =
                (response["id"].as_u64(), response["result"].as_object())
            {
                let fee = if let Some(fee_float) = result["priorityFeeEstimate"].as_f64() {
                    fee_float as u64
                } else if let Some(fee_int) = result["priorityFeeEstimate"].as_u64() {
                    fee_int
                } else {
                    continue;
                };

                if let Some(token_mint) = token_to_request_id
                    .iter()
                    .find(|(_, &req_id)| req_id == id)
                    .map(|(token, _)| *token)
                {
                    results.insert(token_mint, fee);
                }
            }
        }

        Ok(results)
    }

    async fn handle_command(&mut self, command: ShylockCommand) -> Result<()> {
        match command {
            ShylockCommand::RegisterToken { context, reply } => {
                self.handle_register_token(context, reply).await?
            }
            ShylockCommand::DeregisterToken { mint } => self.handle_deregister_token(mint).await?,
            ShylockCommand::GetCachedTokenData { mint, reply } => {
                self.handle_get_cached_token_data(mint, reply).await?
            }
            ShylockCommand::GetPriorityFee { token_mint, reply } => {
                self.handle_get_priority_fee(token_mint, reply).await?
            }
            ShylockCommand::GetFeeConfig { protocol, reply } => {
                self.handle_get_fee_config(protocol, reply).await?
            }
            ShylockCommand::GetLiveTokenData { mint, reply } => {
                self.handle_get_live_token_data(mint, reply).await?
            }
            ShylockCommand::GetConfirmedTransaction { signature, reply } => {
                self.handle_get_confirmed_transaction(signature, reply)
                    .await?
            }
        }
        Ok(())
    }

    async fn handle_register_token(
        &mut self,
        context: TokenContext,
        reply: oneshot::Sender<Result<()>>,
    ) -> Result<()> {
        let mint = context.token_mint;
        let mut subscriptions = self.token_subscriptions.write().await;

        if let Some((count, _)) = subscriptions.get_mut(&mint) {
            *count += 1;
            info!(mint = %mint, new_count = *count, "registered token subscription");
            let _ = reply.send(Ok(()));
        } else {
            info!(mint = %mint, new_count = 1, "registered token subscription");
            info!(mint = %mint, "first subscription; fetching and caching on-chain data");

            // we are dropping the subscriptions lock here to avoid holding it during the async rpc call.
            // this is safe because we are the only writer for a new entry.
            drop(subscriptions);

            let rpc_client = self.rpc_client.clone();
            let mut attempts = 0;
            let max_attempts = 5;
            let base_delay = Duration::from_secs(1);

            let fetch_result = loop {
                attempts += 1;
                match Self::fetch_and_build_cache_entry(rpc_client.clone(), &context).await {
                    Ok(data) => break Ok(data),
                    Err(e) => {
                        if attempts >= max_attempts {
                            let err_msg = format!(
                                "failed to fetch on-chain data for new token after {} attempts: {}",
                                max_attempts, e
                            );
                            error!(mint = %mint, error = %err_msg);
                            break Err(anyhow!(err_msg));
                        }
                        let delay = base_delay * 2u32.pow(attempts - 1);
                        warn!(mint = %mint, attempt = attempts, "failed to fetch on-chain data, retrying in {:?}...", delay);
                        tokio::time::sleep(delay).await;
                    }
                }
            };

            // re-acquire locks to update state
            let mut subscriptions = self.token_subscriptions.write().await;
            let mut cache = self.token_cache.write().await;

            match fetch_result {
                Ok(data) => {
                    cache.insert(mint, data);
                    subscriptions.insert(mint, (1, context.clone()));
                    info!(mint = %mint, "successfully cached on-chain data");
                    let _ = reply.send(Ok(()));
                }
                Err(e) => {
                    // if fetching failed, we do not insert a subscription entry, preventing state corruption.
                    let _ = reply.send(Err(e));
                }
            }
        }
        Ok(())
    }

    async fn handle_deregister_token(&mut self, mint: Pubkey) -> Result<()> {
        let mut subs = self.token_subscriptions.write().await;
        if let Some((count, _)) = subs.get_mut(&mint) {
            *count = count.saturating_sub(1);
            info!(%mint, new_count = *count, "deregistered token subscription");
            if *count == 0 {
                subs.remove(&mint);
                self.token_cache.write().await.remove(&mint);
                info!(%mint, "last subscription removed; clearing cache");
            }
        }
        Ok(())
    }

    async fn handle_get_cached_token_data(
        &self,
        mint: Pubkey,
        reply: oneshot::Sender<Option<Arc<CachedTokenData>>>,
    ) -> Result<()> {
        let cache = self.token_cache.read().await;
        let data = cache.get(&mint).map(|d| Arc::new(d.clone()));
        let _ = reply.send(data);
        Ok(())
    }

    async fn handle_get_priority_fee(
        &self,
        token_mint: Pubkey,
        reply: oneshot::Sender<u64>,
    ) -> Result<()> {
        let cache = self.token_cache.read().await;
        let fee = cache
            .get(&token_mint)
            .map(|d| d.priority_fee)
            .unwrap_or(DEFAULT_PRIORITY_FEE_MICROLAMPORTS_PER_CU);
        let _ = reply.send(fee);
        Ok(())
    }

    async fn handle_get_fee_config(
        &self,
        protocol: Protocol,
        reply: oneshot::Sender<Option<FeeConfig>>,
    ) -> Result<()> {
        let fee_program_id = Pubkey::from_str(PUMP_FEES_PROGRAM_ID)?;
        let program_id_str = match protocol {
            Protocol::PumpFun => PUMP_PROGRAM_ID,
            Protocol::PumpSwap => PUMPSWAP_PROGRAM_ID,
        };
        let program_id = Pubkey::from_str(program_id_str)?;

        let (fee_config_pda, _) =
            Pubkey::find_program_address(&[b"fee_config", program_id.as_ref()], &fee_program_id);

        let fee_config = match self.rpc_client.get_account(&fee_config_pda) {
            Ok(account) => FeeConfig::deserialize(&mut &account.data[8..]).ok(),
            Err(_) => None,
        };
        let _ = reply.send(fee_config);
        Ok(())
    }

    async fn fetch_and_build_cache_entry(
        rpc_client: Arc<RpcClient>,
        context: &TokenContext,
    ) -> Result<CachedTokenData> {
        let (pumpfun_data, pumpswap_data) = if context.is_migrated {
            // fetch global config
            let global_config_pubkey = Pubkey::from_str(PUMPSWAP_GLOBAL_PUBKEY)?;
            let global_config_account = rpc_client.get_account(&global_config_pubkey)?;
            let global_config = GlobalConfig::deserialize(&mut &global_config_account.data[8..])?;

            // fetch pool
            let pool_account = rpc_client.get_account(&context.pool.unwrap())?;
            let pool_data = Pool::deserialize(&mut &pool_account.data[8..])?;

            let pool_base_reserves = rpc_client
                .get_token_account_balance(&pool_data.pool_base_token_account)?
                .amount
                .parse::<u64>()?;
            let pool_quote_reserves = rpc_client
                .get_token_account_balance(&pool_data.pool_quote_token_account)?
                .amount
                .parse::<u64>()?;

            let data = PumpSwapData {
                coin_creator: pool_data.coin_creator,
                pool_base_token_account: pool_data.pool_base_token_account,
                pool_quote_token_account: pool_data.pool_quote_token_account,
                pool_base_reserves,
                pool_quote_reserves,
                global_config,
            };
            (None, Some(data))
        } else {
            // fetch global state
            let global_pubkey = Pubkey::from_str(PUMP_GLOBAL_PUBKEY)?;
            let global_account = rpc_client.get_account(&global_pubkey)?;
            let global_state = Global::deserialize(&mut &global_account.data[8..])?;

            let bc_account = rpc_client.get_account(&context.bonding_curve)?;
            let bc_data = BondingCurve::deserialize(&mut &bc_account.data[8..])?;
            let data = PumpFunData {
                global_state,
                creator: bc_data.creator,
                bonding_curve: bc_data,
            };
            (Some(data), None)
        };

        Ok(CachedTokenData {
            priority_fee: DEFAULT_PRIORITY_FEE_MICROLAMPORTS_PER_CU,
            fee_config: None,
            pumpfun_data,
            pumpswap_data,
        })
    }
}
