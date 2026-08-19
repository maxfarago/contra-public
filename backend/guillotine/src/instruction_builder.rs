use crate::protocols::{
    pumpfun::build_pumpfun_instructions, pumpswap::build_pumpswap_instructions,
};
use crate::ExecutionPlan;
use anyhow::Result;
use commons::contracts::{ExecutionOrder, ShylockCommand};
use commons::types::Protocol;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey, pubkey::Pubkey, system_instruction};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::oneshot;

const AXTON_FEE_WALLET: Pubkey = pubkey!("convgDvzZP1DWz18d5ZUVb8keUaqxaYp8VpDkGnYuV8");
const DEFAULT_PRIORITY_FEE_MICROLAMPORTS_PER_CU: u64 = 1_000_000; // 0.001 Lamports/CU

pub async fn build_plan(
    command: &ExecutionOrder,
    rpc_client: Arc<RpcClient>,
    fee_request_sender: &mpsc::UnboundedSender<ShylockCommand>,
) -> Result<ExecutionPlan> {
    let mut instructions = match command.protocol {
        Protocol::PumpFun => {
            build_pumpfun_instructions(command, &command.wallet_pubkey, &rpc_client).await?
        }
        Protocol::PumpSwap => {
            build_pumpswap_instructions(command, &command.wallet_pubkey, &rpc_client).await?
        }
    };

    // if a fee is specified, add a system transfer instruction to the transaction
    if command.fee_lamports > 0 {
        let fee_transfer_instruction = system_instruction::transfer(
            &command.wallet_pubkey,
            &AXTON_FEE_WALLET,
            command.fee_lamports,
        );
        instructions.push(fee_transfer_instruction);
    }

    // get priority fee estimate from shylock
    let (tx, rx) = oneshot::channel();
    fee_request_sender.send(ShylockCommand::GetPriorityFee {
        token_mint: command.token_mint,
        reply: tx,
    })?;

    // clamp priority fee to a sane minimum
    let priority_fee = rx
        .await
        .unwrap_or(DEFAULT_PRIORITY_FEE_MICROLAMPORTS_PER_CU)
        .max(DEFAULT_PRIORITY_FEE_MICROLAMPORTS_PER_CU);

    let plan = ExecutionPlan {
        instructions,
        compute_unit_limit: command.compute_unit_limit,
        priority_fee_microlamports_per_cu: Some(priority_fee),
        max_retries: command.max_retries.unwrap_or(3) as u8,
    };

    Ok(plan)
}
