### **1. `buffett/Cargo.toml`**

*   **Action:** Add a new dependency for the concurrent `HashMap`.
*   **Specification:**
    *   Under the `[dependencies]` section, add:
        ```toml
        dashmap = "5.5"
        ```

### **2. `trades/Cargo.toml`**

*   **Action:** Add `tokio` as a dependency, as `trades` now owns the actor runtime which requires channels.
*   **Specification:**
    *   Under the `[dependencies]` section, add:
        ```toml
        tokio = { version = "1", features = ["full"] }
        ```

### **3. `buffett/src/registry.rs` (New File)**

*   **Action:** Create a new module to define and encapsulate all `TradeRegistry` logic.
*   **Specification:**
    *   **`TradeInfo` Struct (Private):**
        *   A private struct to hold all metadata for a running trade actor.
        *   Fields:
            *   `channel_sender: mpsc::Sender<TransactionLogs>`
            *   `monitored_token: Pubkey`
            *   `token_context: TokenContext`
    *   **`TradeRegistry` Struct:**
        *   Define a public struct `TradeRegistry`.
        *   It will contain two private fields, wrapped in an `Arc<RwLock<...>>`:
            *   `actors`: A `HashMap<String, TradeInfo>`. This maps a `trade_id` to the complete `TradeInfo` struct.
            *   `market_subscriptions`: A `HashMap<Pubkey, Vec<String>>`. The index mapping a mint address to a list of `trade_id`s.
    *   **Public Methods:**
        *   **`new()`:** A public constructor.
        *   **`register(...)`:** An `async` method to create and spawn a new `TradeActor`.
            *   **Logic:**
                1.  Builds the `Box<dyn Trade>` from the config to get its ID, monitored token, and `TokenContext`.
                2.  Creates a **bounded** `mpsc::channel<TransactionLogs>` with a capacity of **128**.
                3.  Instantiates the `TradeActor` (from the `trades` crate) with the `Box<dyn Trade>` and the channel receiver.
                4.  Spawns the `trade_actor.run()` method onto a new `tokio` task.
                5.  Creates the `TradeInfo` struct containing the channel sender and the discovered context.
                6.  Acquires a write lock and inserts the `TradeInfo` into the `actors` map and the `trade_id` into the `market_subscriptions` index.
        *   **`deregister(&self, trade_id: &str) -> Option<TokenContext>`:** An `async` method that shuts down a trade and returns its context.
            *   **Logic:**
                1.  Acquires a write lock.
                2.  Calls `.remove(trade_id)` on the `actors` map. This atomically removes the `TradeInfo` and returns it.
                3.  If a `TradeInfo` was removed:
                    *   It uses the `monitored_token` from the `TradeInfo` to find and remove the `trade_id` from the `market_subscriptions` index.
                    *   Dropping the `TradeInfo` (which contains the sender) will close the channel, gracefully terminating the actor's loop.
                    *   It returns `Some(trade_info.token_context)`.
                4.  If no trade was found, it returns `None`.
        *   **`get_subscribers(...)`:** The core fan-out method (logic remains the same).

### **4. `trades/src/actor.rs` (New File)**

*   **Action:** Create a new module *within the `trades` crate* for the `TradeActor` harness.
*   **Specification:**
    *   **`TradeActor` Struct:** A public struct containing the `trade: Box<dyn Trade>` and `log_receiver: mpsc::Receiver<TransactionLogs>`.
    *   **Public Methods:**
        *   **`new(...)`:** A public constructor.
        *   **`run(mut self)`:** The actor's main `async` loop, which receives logs from its channel and calls `self.trade.process_logs(...)`.

### **5. `trades/src/lib.rs`**

*   **Action:** Update the `Trade` trait and expose the new `actor` module.
*   **Specification:**
    *   Add `pub mod actor;` to make the `TradeActor` available to other crates (specifically `buffett`).
    *   Update the `pub trait Trade`:
        *   Remove `async fn process_transaction(&self, logs: &[PumpLog]) -> anyhow::Result<Vec<ExecutionOrder>>;`
        *   Add `async fn process_logs(&mut self, logs: TransactionLogs) -> Result<()>;`

### **6. `trades/src/examples/countersell/mod.rs` (Modification)**

*   **Action:** Update the `Countersell` implementation to conform to the new `Trade` trait.
*   **Specification:**
    *   **Refactor Existing Logic:** Rename the existing `process_transaction` method to a private helper, e.g., `process_parsed_logs(&self, logs: &[PumpLog]) -> Result<Vec<ExecutionOrder>>`.
    *   **Implement Parsing Helper:** Create a new private helper method, `parse_pump_logs_from_transaction`, that takes `raw_logs: &[String]` and a `signature: &str` and returns a `Result<Vec<PumpLog>>`. This function will contain the logic to filter for "Program data:" logs and construct the `PumpLog` objects.
    *   **Implement New Trait Method:** Implement `async fn process_logs(&mut self, logs: TransactionLogs) -> Result<()>`. This method will call the parsing helper and then pass the result to the refactored business logic helper. For now, it will discard any `ExecutionOrder`s that are produced.

### **7. `buffett/src/lib.rs`**

*   **Action:** Integrate the new `TradeRegistry` and `DashMap` into `Buffett`.
*   **Specification:**
    *   **Modules:** Declare the new public module: `pub mod registry;`.
    *   **Type Alias:** `pub type PoolToMintMap = Arc<DashMap<Pubkey, (Pubkey, u32)>>;`
    *   **`Buffett` Struct:** Replace `trades: Arc<RwLock<TradeMap>>` with `registry: TradeRegistry`.
    *   **`route_transaction_logs` method:** Logic remains the same, calling `self.registry.get_subscribers(...)` and using `try_send`.

### **8. `buffett/src/handlers.rs`**

*   **Action:** Refactor lifecycle handlers to use the `TradeRegistry` and manage `PoolToMintMap` reference counts.
*   **Specification:**
    *   **`handle_create_trade`:**
        *   **Logic:**
            1.  Performs the initial `build_trade` to get the `TokenContext`.
            2.  Uses the `TokenContext` to update the reference count in `self.pool_to_mint_map`.
            3.  Calls `self.registry.register(config, ...)` to hand off actor spawning responsibility.
    *   **`handle_delete_trade`:**
        *   **Logic:**
            1.  Calls `self.registry.deregister(&trade_id).await`.
            2.  If the call returns `Some(context)`, it uses `context.pool` to find and decrement the reference count in `self.pool_to_mint_map`, removing the entry if the count reaches zero.

### **9. `src/app.rs`**

*   **Action:** Update the application's composition root.
*   **Specification:**
    *   In `Application::build`:
        *   Remove the `TradeMap` initialization.
        *   Instantiate `let trade_registry = TradeRegistry::new();`.
        *   Update the `Buffett::new(...)` call to pass the `trade_registry`.