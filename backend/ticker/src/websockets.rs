use crate::Ticker;
use anyhow::{anyhow, Result};
use commons::{
    chain::{PUMPSWAP_PROGRAM_ID, PUMP_PROGRAM_ID},
    contracts::TransactionLogs,
    types::Protocol,
};
use futures_util::{stream::StreamExt, SinkExt};
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{debug, error, info, warn};

const HELIUS_WSS_URL: &str = "wss://mainnet.helius-rpc.com/";

impl Ticker {
    pub async fn start_websockets(&self, rpc_api_key: &str) -> Result<()> {
        info!("starting ticker websocket connections...");

        let pumpfun_handle = tokio::spawn(connect_and_listen(
            self.buffett_sender.clone(),
            Protocol::PumpFun,
            PUMP_PROGRAM_ID,
            rpc_api_key.to_string(),
        ));

        let pumpswap_handle = tokio::spawn(connect_and_listen(
            self.buffett_sender.clone(),
            Protocol::PumpSwap,
            PUMPSWAP_PROGRAM_ID,
            rpc_api_key.to_string(),
        ));

        // Keep the main task alive, waiting for websocket tasks
        let _ = tokio::try_join!(pumpfun_handle, pumpswap_handle)?;

        Ok(())
    }
}

// Helper function to parse the raw log data from the JSON payload.
// It returns an Option, which is None if any part of the expected structure is missing.
fn parse_raw_logs(json: &Value) -> Option<(String, Vec<String>)> {
    let value = json.get("params")?.get("result")?.get("value")?;

    let signature = value.get("signature")?.as_str()?.to_string();
    let log_array = value.get("logs")?.as_array()?;

    let logs: Vec<String> = log_array
        .iter()
        .filter_map(|log| log.as_str().map(String::from))
        .collect();

    Some((signature, logs))
}

async fn connect_and_listen(
    buffett_sender: mpsc::UnboundedSender<TransactionLogs>,
    protocol: Protocol,
    program_id: &'static str,
    rpc_api_key: String,
) -> Result<()> {
    // The entire connection logic is wrapped in an infinite loop for auto-reconnection.
    loop {
        let ws_url = format!("{}?api-key={}", HELIUS_WSS_URL, rpc_api_key);

        // Attempt to connect
        let ws_stream = match connect_async(&ws_url).await {
            Ok((stream, _)) => {
                debug!("[{:?}] successfully connected to websocket.", protocol);
                stream
            }
            Err(e) => {
                error!(
                    "[{:?}] failed to connect: {}. retrying in 5s...",
                    protocol, e
                );
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                continue; // Retry connection
            }
        };

        let (mut write, mut read) = ws_stream.split();

        // Subscribe to logs for the given program ID
        let subscribe_request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "logsSubscribe",
            "params": [
                { "mentions": [program_id] },
                { "commitment": "processed" }
            ]
        });

        if let Err(e) = write
            .send(Message::Text(subscribe_request.to_string()))
            .await
        {
            error!(
                "[{:?}] failed to subscribe: {}. reconnecting...",
                protocol, e
            );
            continue; // Retry connection
        }

        debug!("[{:?}] successfully subscribed to logs.", protocol);

        // Message reading loop
        while let Some(message_result) = read.next().await {
            match message_result {
                Ok(Message::Text(text)) => {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if let Some((signature, logs)) = parse_raw_logs(&json) {
                            let tx_logs = TransactionLogs {
                                protocol,
                                signature,
                                logs,
                            };

                            if buffett_sender.send(tx_logs).is_err() {
                                warn!("[{:?}] buffett receiver closed, stopping.", protocol);
                                return Err(anyhow!("buffett receiver channel closed"));
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) => {
                    warn!(
                        "[{:?}] websocket closed by server. reconnecting...",
                        protocol
                    );
                    break;
                }
                Err(e) => {
                    error!(
                        "[{:?}] error reading from websocket: {}. reconnecting...",
                        protocol, e
                    );
                    break;
                }
                _ => { /* Ignore other message types */ }
            }
        }
        warn!("[{:?}] disconnected. reconnecting in 5s...", protocol);
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}
