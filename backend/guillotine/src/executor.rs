use crate::{
    instruction_builder, transaction_sender,
    wallet_manager::{self, HotWallet, WalletManagerCommand},
};
use anyhow::{anyhow, Result};
use aws_sdk_kms::Client as KmsClient;
use commons::contracts::{ExecutionOrder, ExecutionResult, HermesCommand, ShylockCommand};
use commons::types::ExecutionStage;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{mpsc, RwLock};
use tracing::{debug, error, info, warn};

fn is_retryable_error(error: &anyhow::Error) -> bool {
    let error_string = error.to_string().to_lowercase();
    let non_retryable_substrings = [
        "insufficient funds",
        "insufficient lamports",
        "custom program error",
        "account in use",
        "invalid account",
    ];

    !non_retryable_substrings
        .iter()
        .any(|s| error_string.contains(s))
}

pub struct TransactionExecutor {
    execution_receiver: mpsc::UnboundedReceiver<ExecutionOrder>,
    wallet_command_receiver: mpsc::UnboundedReceiver<WalletManagerCommand>,
    rpc_client: Arc<RpcClient>,
    kms_client: KmsClient,
    kms_key_id: String,
    signers: Arc<RwLock<HashMap<Pubkey, Arc<HotWallet>>>>,
    hermes_sender: mpsc::UnboundedSender<HermesCommand>,
    dry_run: bool,
    result_sender: mpsc::UnboundedSender<ExecutionResult>,
    fee_request_sender: mpsc::UnboundedSender<ShylockCommand>,
}

impl TransactionExecutor {
    pub fn new(
        execution_receiver: mpsc::UnboundedReceiver<ExecutionOrder>,
        wallet_command_receiver: mpsc::UnboundedReceiver<WalletManagerCommand>,
        rpc_client: Arc<RpcClient>,
        kms_client: KmsClient,
        kms_key_id: String,
        hermes_sender: mpsc::UnboundedSender<HermesCommand>,
        result_sender: mpsc::UnboundedSender<ExecutionResult>,
        fee_request_sender: mpsc::UnboundedSender<ShylockCommand>,
    ) -> Result<Self> {
        info!("guillotine configured with KMS key ID: {}", kms_key_id);

        Ok(Self {
            execution_receiver,
            wallet_command_receiver,
            rpc_client,
            kms_client,
            kms_key_id,
            signers: Arc::new(RwLock::new(HashMap::new())),
            hermes_sender,
            dry_run: true,
            result_sender,
            fee_request_sender,
        })
    }

    pub fn enable_live_trading(mut self) -> Self {
        self.dry_run = false;
        self
    }

    pub async fn start(mut self) -> Result<()> {
        info!("guillotine transaction executor started");

        if self.dry_run {
            warn!("running in dry-run mode (no actual transactions will be sent)");
        } else {
            info!("live trading is enabled");
        }

        // spawn the wallet manager loop
        let signers_clone = self.signers.clone();
        let mut wallet_receiver = self.wallet_command_receiver;
        let kms_client_clone = self.kms_client.clone();
        let kms_key_id_clone = self.kms_key_id.clone();
        tokio::spawn(async move {
            wallet_manager::wallet_manager_loop(
                &mut wallet_receiver,
                signers_clone,
                kms_client_clone,
                kms_key_id_clone,
            )
            .await;
        });

        // start the main command processing loop
        while let Some(command) = self.execution_receiver.recv().await {
            let rpc_client = self.rpc_client.clone();
            let signers = self.signers.clone();
            let hermes_sender = self.hermes_sender.clone();
            let dry_run = self.dry_run;
            let result_sender = self.result_sender.clone();
            let fee_request_sender = self.fee_request_sender.clone();

            tokio::spawn(async move {
                if let Err(e) = Self::process_order(
                    command,
                    rpc_client,
                    signers,
                    hermes_sender,
                    dry_run,
                    result_sender,
                    fee_request_sender,
                )
                .await
                {
                    error!("error processing command: {}", e);
                }
            });
        }

        Ok(())
    }

    async fn process_order(
        command: ExecutionOrder,
        rpc_client: Arc<RpcClient>,
        signers: Arc<RwLock<HashMap<Pubkey, Arc<HotWallet>>>>,
        hermes_sender: mpsc::UnboundedSender<HermesCommand>,
        dry_run: bool,
        result_sender: mpsc::UnboundedSender<ExecutionResult>,
        fee_request_sender: mpsc::UnboundedSender<ShylockCommand>,
    ) -> Result<()> {
        info!("received command: {:?}", command);

        let wallet_pubkey = command.wallet_pubkey;

        let plan =
            instruction_builder::build_plan(&command, rpc_client.clone(), &fee_request_sender)
                .await?;

        // log the plan details for live trading
        if !dry_run {
            info!(
                order_id = %command.order_id,
                instructions = plan.instructions.len(),
                "generated execution plan for live submission"
            );
        }

        // publish SUBMITTED execution result
        let submitted = Self::make_result(&command, ExecutionStage::Submitted, None, None);
        let _ = result_sender.send(submitted);

        if dry_run {
            info!(
                instructions = plan.instructions.len(),
                priority_fee = plan.priority_fee_microlamports_per_cu,
                max_retries = plan.max_retries,
                "received execution plan (DRY RUN)"
            );
            transaction_sender::log_instruction_details(&plan);

            // simulate CONFIRMED execution result for the DRY RUN
            let confirmed = Self::make_result(
                &command,
                ExecutionStage::Confirmed,
                Some("DRY-RUN-SIGNATURE-NOT-SUBMITTED".to_string()),
                None,
            );

            if let Err(_e) = result_sender.send(confirmed.clone()) {
                error!(trade_id = %confirmed.trade_id, "failed to send dry run result: channel closed?");
            } else {
                debug!(trade_id = %confirmed.trade_id, "successfully sent DRY RUN result");
            }

            return Ok(());
        }

        // ==============================
        // ---  LIVE TRADE EXECUTION  ---
        // ==============================

        // fetch the required signer from the cache
        let signer = {
            let signers_map = signers.read().await;
            signers_map.get(&wallet_pubkey).cloned()
        };

        let Some(signer) = signer else {
            error!(pubkey = %wallet_pubkey, "signer not found in cache for command, aborting");

            // publish the FAILED execution result
            let failed_result = Self::make_result(
                &command,
                ExecutionStage::Failed,
                None,
                Some("Signer not found in cache".to_string()),
            );
            let _ = result_sender.send(failed_result);

            // log the failure to the database
            let _ = hermes_sender.send(HermesCommand::LogOrder {
                order_id: command.order_id.clone(),
                level: "error".to_string(),
                message: format!("Aborting trade for wallet {}", wallet_pubkey),
            });

            return Err(anyhow!("Signer {} not found in cache", wallet_pubkey));
        };

        // submit the transaction
        let mut retry_count = 0;
        let max_retries = plan.max_retries;

        loop {
            match transaction_sender::submit_transaction(
                plan.clone(),
                rpc_client.clone(),
                signer.clone(),
            )
            .await
            {
                Ok(signature) => {
                    let _ = hermes_sender.send(HermesCommand::LogOrder {
                        order_id: command.order_id.clone(),
                        level: "info".to_string(),
                        message: format!("Trade executed successfully; signature: {}", signature),
                    });

                    // publish CONFIRMED execution result
                    let confirmed = Self::make_result(
                        &command,
                        ExecutionStage::Confirmed,
                        Some(signature.to_string()),
                        None,
                    );
                    let _ = result_sender.send(confirmed);
                    break;
                }
                Err(e) => {
                    if is_retryable_error(&e) && retry_count < max_retries {
                        retry_count += 1;
                        warn!(
                            "Transaction failed (attempt {}/{}): {}. Retrying...",
                            retry_count, max_retries, e
                        );
                        tokio::time::sleep(tokio::time::Duration::from_secs(
                            2_u64.pow(retry_count as u32),
                        ))
                        .await;
                    } else {
                        let reason = if is_retryable_error(&e) {
                            format!("failed after max retries ({})", max_retries)
                        } else {
                            "failed with a non-retryable error".to_string()
                        };

                        error!("Transaction {}: {}", reason, e);

                        // publish FAILED result
                        let failed = Self::make_result(
                            &command,
                            ExecutionStage::Failed,
                            None,
                            Some(e.to_string()),
                        );
                        let _ = result_sender.send(failed);

                        // log the failure to the database
                        let _ = hermes_sender.send(HermesCommand::LogOrder {
                            order_id: command.order_id.clone(),
                            level: "error".to_string(),
                            message: format!("Trade execution {}: {}", reason, e),
                        });

                        return Err(e);
                    }
                }
            }
        }
        Ok(())
    }

    fn make_result(
        cmd: &ExecutionOrder,
        stage: ExecutionStage,
        signature: Option<String>,
        error: Option<String>,
    ) -> ExecutionResult {
        let (lamports_in, lamports_out, tokens_in, tokens_out) = if cmd.is_buy {
            (cmd.sol_amount, 0, 0, cmd.token_amount)
        } else {
            (0, cmd.sol_amount, cmd.token_amount, 0)
        };

        ExecutionResult {
            trade_id: cmd.trade_id.clone(),
            order_id: cmd.order_id.clone(),
            stage,
            signature,
            error,
            lamports_in,
            lamports_out,
            tokens_in,
            tokens_out,
        }
    }
}
