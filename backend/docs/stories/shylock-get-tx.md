### Revised Plan

1.  **Add a `GetConfirmedTransaction` Command to `Shylock`:**
    -   We'll add a new variant to the `ShylockCommand` enum in `commons/src/contracts.rs`. This command will take a transaction signature and a `oneshot::Sender` for the reply.
    -   `Shylock`'s main loop will handle this command by using its `RpcClient` to fetch the transaction and send it back to the requester.

2.  **Refactor All Trade Actors to Use the New Command:**
    -   Remove the `RpcClient` instance from `OneShotBuy` and `OneShotSell`.
    -   Update the `on_result` methods in `OneShotBuy`, `OneShotSell`, and `Countersell` to send the `GetConfirmedTransaction` command to `Shylock` instead of using a local `RpcClient`.
    -   The actors will then wait on the `oneshot` channel for the transaction data before proceeding to parse it and log it.

3.  **Share `parse_balance_changes`:**
    -   The `parse_balance_changes` function still needs to be moved out of the `oneshot` module so it can be used by `Countersell`. We'll place it in a shared utility location.

This approach is cleaner, more robust, and correctly separates concerns. It reinforces `Shylock`'s role as the sole oracle for on-chain data, making the trade actors simpler and more focused on their state logic.

I will now prepare the necessary code modifications for this superior architecture.

[5 tools called]

You are spot on. Here is the plan to refactor the codebase to centralize transaction fetching in `Shylock`.

### Step 1: Move `parse_balance_changes` to a Shared Location

The `parse_balance_changes` function is needed by all trade actors. We'll move it from `trades/src/examples/oneshot/mod.rs` to `trades/src/lib.rs` and make it public.

### Step 2: Add `GetConfirmedTransaction` to `ShylockCommand`

We'll add a new command to `commons/src/contracts.rs` to request a confirmed transaction from `Shylock`.

```rust:commons/src/contracts.rs
// ... existing code ...
    GetLiveTokenData {
        mint: Pubkey,
        reply: oneshot::Sender<Option<Arc<CachedTokenData>>>,
    },
    GetConfirmedTransaction {
        signature: String,
        reply: oneshot::Sender<Result<solana_transaction_status::EncodedTransactionWithStatusMeta>>,
    },
}

#[derive(Debug)]
// ... existing code ...
```

### Step 3: Implement the Handler in `Shylock`

Next, we'll add the handler for the new command in `shylock/src/lib.rs`.

```rust:shylock/src/lib.rs
// ... existing code ...
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use solana_transaction_status::UiTransactionEncoding;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
// ... existing code ...
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
// ... existing code ...
// ... existing code ...
    async fn handle_get_live_token_data(
        &self,
        mint: Pubkey,
        reply: oneshot::Sender<Option<Arc<CachedTokenData>>>,
    ) -> Result<()> {
        let context = self
            .token_subscriptions
            .read()
            .await
            .get(&mint)
            .map(|(_, ctx)| ctx.clone());

        if let Some(context) = context {
            let data = Self::fetch_and_build_cache_entry(self.rpc_client.clone(), &context).await?;
            let _ = reply.send(Some(Arc::new(data)));
        } else {
            let _ = reply.send(None);
        }

        Ok(())
    }

    async fn handle_get_confirmed_transaction(
        &self,
        signature: String,
        reply: oneshot::Sender<Result<solana_transaction_status::EncodedTransactionWithStatusMeta>>,
    ) -> Result<()> {
        let tx = self
            .rpc_client
            .get_transaction_with_config(
                &signature.parse()?,
                solana_client::rpc_config::RpcTransactionConfig {
                    encoding: Some(UiTransactionEncoding::JsonParsed),
                    commitment: Some(solana_sdk::commitment_config::CommitmentConfig::confirmed()),
                    max_supported_transaction_version: Some(0),
                },
            )
            .map_err(|e| e.into());
        let _ = reply.send(tx);
        Ok(())
    }

    async fn fetch_and_build_cache_entry(
        rpc_client: Arc<RpcClient>,
        context: &TokenContext,
// ... existing code ...
```

### Step 4: Refactor Trade Actors

Finally, we'll update all three trade actors to use this new `Shylock` command instead of a local `RpcClient`.

#### `trades/src/examples/oneshot/buy.rs`

```rust:trades/src/examples/oneshot/buy.rs
// ... existing code ...
use crate::{price_calculator, Trade};
use commons::{
// ... existing code ...
};

use anyhow::{anyhow, Result};
use borsh::BorshDeserialize;
-use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, signature::Signature};
-use solana_transaction_status::UiTransactionEncoding;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
-use tokio::sync::mpsc;
+use tokio::sync::{mpsc, oneshot};
use tracing::{debug, info};

pub struct OneShotBuy {
// ... existing code ...
    // internal state management
    is_complete: Arc<AtomicBool>,
    token_context: Arc<tokio::sync::RwLock<TokenContext>>,
-   rpc_client: Arc<RpcClient>,
    hermes_sender: mpsc::UnboundedSender<HermesCommand>,
+   shylock_sender: mpsc::UnboundedSender<ShylockCommand>,
}

impl OneShotBuy {
    #[allow(clippy::too_many_arguments)]
// ... existing code ...
        sol_amount: u64,
        slippage_bps: u16,
        token_context: TokenContext,
-       rpc_client: Arc<RpcClient>,
        hermes_sender: mpsc::UnboundedSender<HermesCommand>,
+       shylock_sender: mpsc::UnboundedSender<ShylockCommand>,
    ) -> Self {
        Self {
            order_id,
// ... existing code ...
            sol_amount,
            slippage_bps,
            is_complete: Arc::new(AtomicBool::new(false)),
            token_context: Arc::new(tokio::sync::RwLock::new(token_context)),
-           rpc_client,
            hermes_sender,
+           shylock_sender,
        }
    }
}
// ... existing code ...
// ... existing code ...
                let signature = signature_str.parse::<Signature>()?;

                info!(order_id = %self.order_id, "fetching confirmed transaction to parse final amounts");
-               let tx = self.rpc_client.get_transaction_with_config(
-                   &signature,
-                   solana_client::rpc_config::RpcTransactionConfig {
-                       encoding: Some(UiTransactionEncoding::JsonParsed),
-                       commitment: Some(
-                           solana_sdk::commitment_config::CommitmentConfig::confirmed(),
-                       ),
-                       max_supported_transaction_version: Some(0),
-                   },
-               )?;

+               let (tx_reply, rx_reply) = oneshot::channel();
+               self.shylock_sender.send(ShylockCommand::GetConfirmedTransaction {
+                   signature: signature_str.clone(),
+                   reply: tx_reply,
+               })?;
+               let tx = rx_reply.await??;
+
                let (sol_change, token_change) =
-                   parse_balance_changes(tx, &self.wallet_pubkey, &self.token_to_buy)?;
+                   crate::parse_balance_changes(tx, &self.wallet_pubkey, &self.token_to_buy)?;

                info!(order_id = %self.order_id, sol_change = sol_change, token_change = token_change, "parsed transaction balance changes");

// ... existing code ...
```