use anyhow::{anyhow, Result};
use aws_config::SdkConfig;
use aws_sdk_sqs::{types::Message, Client};
use commons::contracts::BuffettCommand;
use tokio::sync::mpsc;
use tracing::{error, info};

mod handlers;
mod types;

use types::SqsCommand;

pub struct Janus {
    sqs_client: Client,
    queue_url: String,
    buffett_sender: mpsc::UnboundedSender<BuffettCommand>,
}

impl Janus {
    pub async fn new(
        queue_url: String,
        aws_shared_config: SdkConfig,
        buffett_sender: mpsc::UnboundedSender<BuffettCommand>,
    ) -> Result<Self> {
        let sqs_client = Client::new(&aws_shared_config);

        Ok(Self {
            sqs_client,
            queue_url,
            buffett_sender,
        })
    }

    pub async fn start(self) {
        info!(
            queue_url = %self.queue_url,
            "starting janus gateway, polling SQS queue..."
        );
        tokio::spawn(async move {
            self.command_loop().await;
        });
    }

    async fn command_loop(&self) {
        loop {
            let result = self
                .sqs_client
                .receive_message()
                .queue_url(&self.queue_url)
                .wait_time_seconds(20)
                .send()
                .await;

            match result {
                Ok(output) => {
                    if let Some(messages) = output.messages {
                        for message in messages {
                            if let Err(e) = self.handle_message(message).await {
                                error!(error = %e, "failed to handle SQS message");
                            }
                        }
                    }
                }
                Err(e) => {
                    error!(error = %e, "failed to receive messages from SQS");
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        }
    }

    async fn handle_message(&self, message: Message) -> Result<()> {
        let body = message
            .body()
            .ok_or_else(|| anyhow!("SQS message has no body"))?;
        info!(body = body, "successfully received SQS message");

        let command: SqsCommand = serde_json::from_str(body)?;

        match command {
            SqsCommand::CreateOrder(cmd) => self.handle_create_order(cmd).await?,
            SqsCommand::DeleteOrder(cmd) => self.handle_delete_order(cmd).await?,
        }

        let receipt_handle = message
            .receipt_handle()
            .ok_or_else(|| anyhow!("message has no receipt handle"))?;
        self.sqs_client
            .delete_message()
            .queue_url(&self.queue_url)
            .receipt_handle(receipt_handle)
            .send()
            .await?;

        info!("successfully processed and deleted SQS message");

        Ok(())
    }
}
