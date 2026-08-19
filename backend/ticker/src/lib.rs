mod websockets;

use anyhow::Result;
use commons::contracts::TransactionLogs;
use std::env;
use tokio::sync::mpsc;
use tracing::info;

#[derive(Clone)]
pub struct Ticker {
    buffett_sender: mpsc::UnboundedSender<TransactionLogs>,
}

impl Ticker {
    pub fn new(buffett_sender: mpsc::UnboundedSender<TransactionLogs>) -> Result<Self> {
        info!("initializing ticker ingestion service...");
        Ok(Self { buffett_sender })
    }

    pub async fn start(&self) -> Result<()> {
        info!("starting ticker ingestion service...");
        let rpc_api_key =
            env::var("RPC_API_KEY").map_err(|_| anyhow::anyhow!("RPC_API_KEY must be set"))?;
        self.start_websockets(&rpc_api_key).await
    }
}
