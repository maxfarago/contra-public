Of course. Here is a high-level, crate-by-crate implementation plan for the proactive migration check.

### 1. Crate: `commons`

This crate defines the shared contracts. We need to update the `Shylock` message protocol to support a request that expects a direct response.

*   **File:** `src/contracts.rs`
    *   **Objective:** Establish a formal request-response contract for the migration check.
    *   **Action 1: Create a `ShylockResponse` enum.**
        *   This provides a strongly-typed container for replies from `Shylock`.
        ```rust
        pub enum ShylockResponse {
            MigrationStatus(bool),
            // other future response types can be added here
        }
        ```
    *   **Action 2: Add the new command to the `ShylockCommand` enum.**
        *   This variant will include a `tokio::sync::oneshot::Sender` channel, allowing the `Countersell` actor to await a direct reply.
        ```rust
        use tokio::sync::oneshot;

        pub enum ShylockCommand {
            // ... existing variants
            CheckMigrationStatus {
                token_mint: Pubkey,
                response_channel: oneshot::Sender<ShylockResponse>,
            },
        }
        ```

### 2. Crate: `shylock`

This crate is the oracle. It needs to handle the new command by performing the on-chain check.

*   **File:** `src/lib.rs` (or wherever the main actor loop is)
    *   **Objective:** Integrate the new command into `Shylock`'s event processing loop.
    *   **Action:** Add a new match arm to the main `while let Some(command) = self.receiver.recv().await` loop.
        ```rust
        // in Shylock::start() or similar
        ...
        match command {
            // ... existing arms
            ShylockCommand::CheckMigrationStatus { token_mint, response_channel } => {
                // spawn a task to avoid blocking the command loop
                let rpc_client = self.rpc_client.clone();
                tokio::spawn(async move {
                    let status = handlers::verify_migration_status(rpc_client, token_mint).await;
                    let _ = response_channel.send(ShylockResponse::MigrationStatus(status));
                });
            }
        }
        ...
        ```

*   **File:** `src/handlers.rs`
    *   **Objective:** Implement the core RPC logic for checking the on-chain state.
    *   **Action:** Create a new public async function.
        *   This function will contain the logic to derive the Raydium Liquidity Pool V4 address for the token and use the `RpcClient` to check if that account exists.
        ```rust
        use solana_client::rpc_client::RpcClient;
        use solana_program::pubkey::Pubkey;
        use std::sync::Arc;

        pub async fn verify_migration_status(rpc_client: Arc<RpcClient>, token_mint: Pubkey) -> bool {
            // 1. derive the raydium liquidity pool address for the given mint.
            // 2. call `rpc_client.get_account(&pool_address).await`.
            // 3. return `true` if the call succeeds and the account has data, `false` otherwise.
        }
        ```

### 3. Crate: `trades`

This is where the `Countersell` actor's logic will be updated to be more resilient.

*   **File:** `src/examples/countersell/mod.rs`
    *   **Objective:** Modify the `Countersell` actor to use the new proactive check upon encountering the specific `AccountNotInitialized` error.
    *   **Action:** Update the `on_execution_result` handler (or the logic that processes the `ExecutionResult` message).
        ```rust
        // Inside the Countersell actor's on_execution_result handler

        // 1. check if the result is an error.
        if let Err(e) = execution_result.result {
            // 2. parse the error to see if it's the specific migration-related failure.
            //    this involves matching `solana_sdk::transaction::TransactionError::InstructionError(3, InstructionError::Custom(3012))`
            let is_migration_error = ... // error parsing logic here

            if is_migration_error {
                // 3. if it is, create a oneshot channel.
                let (tx, rx) = oneshot::channel();

                // 4. send the check command to shylock.
                let _ = self.shylock_sender.send(ShylockCommand::CheckMigrationStatus {
                    token_mint: self.monitored_token(),
                    response_channel: tx,
                });

                // 5. await the response from shylock.
                if let Ok(ShylockResponse::MigrationStatus(true)) = rx.await {
                    // 6. if shylock confirms migration, update internal state.
                    let mut context = self.token_context.write().await;
                    if !context.is_migrated {
                        context.is_migrated = true;
                        info!(trade_id = %self.id, "forced state update to pumpswap due to execution failure");
                        // also send a hermes log.
                    }
                    // 7. crucially, do not proceed with the normal retry logic for this failed order.
                    return; // exit the handler early.
                }
            }
        }

        // ... existing retry logic for all other error types ...
        ```