use crate::wallet_manager::HotWallet;
use crate::ExecutionPlan;
use anyhow::Result;
use solana_client::{
    rpc_client::RpcClient,
    rpc_config::{RpcSendTransactionConfig, RpcSimulateTransactionConfig},
};
use solana_sdk::{
    commitment_config::CommitmentConfig, compute_budget::ComputeBudgetInstruction,
    signature::Signature, signer::Signer, transaction::Transaction,
};
use std::sync::Arc;
use tokio::task;
use tracing::{debug, error, info};

pub fn log_instruction_details(plan: &ExecutionPlan) {
    for (i, instruction) in plan.instructions.iter().enumerate() {
        debug!(
            instruction_index = i,
            program = %instruction.program_id,
            accounts = ?instruction.accounts.iter().map(|a| a.pubkey.to_string()).collect::<Vec<_>>(),
            data_size = instruction.data.len(),
            "instruction details"
        );
    }
}

pub async fn submit_transaction(
    plan: ExecutionPlan,
    rpc_client: Arc<RpcClient>,
    signer: Arc<HotWallet>,
) -> Result<Signature> {
    let mut instructions = Vec::new();

    if let Some(cu_limit) = plan.compute_unit_limit {
        instructions.push(ComputeBudgetInstruction::set_compute_unit_limit(cu_limit));
    }

    if let Some(priority_fee) = plan.priority_fee_microlamports_per_cu {
        instructions.push(ComputeBudgetInstruction::set_compute_unit_price(
            priority_fee,
        ));
    }

    instructions.extend(plan.instructions);

    let mut transaction = Transaction::new_with_payer(&instructions, Some(&signer.pubkey()));

    // signing is fast, no need for spawn_blocking
    let blockhash = rpc_client.get_latest_blockhash()?;
    debug!("got fresh blockhash for submission: {:?}", blockhash);

    transaction.sign(&[signer.as_ref()], blockhash);

    // simulation is a blocking network call, so we use spawn_blocking
    info!("simulating transaction to check for errors...");
    let sim_rpc = rpc_client.clone();
    let sim_tx = transaction.clone();
    let simulation_result = task::spawn_blocking(move || {
        sim_rpc.simulate_transaction_with_config(
            &sim_tx,
            RpcSimulateTransactionConfig {
                sig_verify: false,
                replace_recent_blockhash: true,
                commitment: Some(CommitmentConfig::confirmed()),
                encoding: None,
                accounts: None,
                min_context_slot: None,
                inner_instructions: true,
            },
        )
    })
    .await?;

    match simulation_result {
        Ok(result) => {
            if let Some(err) = result.value.err {
                error!("transaction simulation failed: {:?}", err);
                if let Some(logs) = result.value.logs {
                    error!("simulation logs:");
                    for log in logs.iter() {
                        error!("  {}", log);
                    }
                }
                return Err(anyhow::anyhow!("simulation failed: {:?}", err));
            } else {
                info!("simulation successful");
                if let Some(logs) = result.value.logs {
                    debug!("simulation logs:");
                    for log in logs.iter() {
                        debug!("  {}", log);
                    }
                }
            }
        }
        Err(e) => {
            error!("failed to simulate transaction: {}", e);
            return Err(e.into());
        }
    }

    // sending is also a blocking network call
    let send_result = task::spawn_blocking(move || {
        rpc_client.send_and_confirm_transaction_with_spinner_and_config(
            &transaction,
            CommitmentConfig::confirmed(),
            RpcSendTransactionConfig {
                skip_preflight: true,
                preflight_commitment: Some(CommitmentConfig::confirmed().commitment),
                encoding: None,
                max_retries: Some(plan.max_retries.into()),
                min_context_slot: None,
            },
        )
    })
    .await?;

    match send_result {
        Ok(signature) => {
            info!("transaction sent (skipped preflight): {}", signature);
            Ok(signature)
        }
        Err(e) => {
            error!("transaction failed: {}", e);
            Err(e.into())
        }
    }
}
