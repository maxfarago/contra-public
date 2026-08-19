### Implementation Plan: Atomic Trade Fees

#### 1. `commons` Crate: Update the Shared Contract

This is the foundation. We need to modify the `ExecutionOrder` to carry the fee information explicitly.

*   **File**: `commons/src/contracts.rs`
*   **Action**: Add a `fee_lamports` field to the `ExecutionOrder` struct.
    ```rust
    // in struct ExecutionOrder
    pub sol_amount: u64,
    pub fee_lamports: u64, // The fee to be transferred to the Axton wallet
    pub slippage_bps: u16,
    ```

#### 2. `trades` Crate: Implement Fee Calculation Logic

Each trade type must be updated to calculate its fee and populate the new field in the `ExecutionOrder`.

*   **File**: `trades/src/examples/oneshot/buy.rs`
*   **Action**: Modify the `activate` method to calculate the fee from the user's input SOL.
    *   Calculate `fee_lamports = (self.sol_amount as u128 * 1 / 100) as u64`.
    *   Calculate the remaining `sol_amount_for_swap = self.sol_amount - fee_lamports`.
    *   When creating the `ExecutionOrder`, populate `sol_amount` with `sol_amount_for_swap` and `fee_lamports` with the calculated fee.

*   **File**: `trades/src/examples/oneshot/sell.rs`
*   **Action**: Modify the `activate` method to calculate the fee based on the *minimum expected* proceeds.
    *   After `min_sol_output` is calculated, derive the fee: `fee_lamports = (min_sol_output as u128 * 1 / 100) as u64`.
    *   When creating the `ExecutionOrder`, populate `sol_amount` with `min_sol_output` and `fee_lamports` with the calculated fee.

*   **File**: `trades/src/examples/countersell/execute.rs`
*   **Action**: Modify the `generate_sell_order` function.
    *   This function already calculates `min_sol_output`.
    *   Calculate the fee: `fee_lamports = (min_sol_output as u128 * 1 / 100) as u64`.
    *   When creating the final `ExecutionOrder` object, populate the new `fee_lamports` field.

#### 3. `guillotine` Crate: Enforce the Fee Atomically

This is where the fee transfer is bundled into the user's transaction. I will need to read the relevant file to confirm the exact implementation details, but the logic will be as follows.

*   **File**: `guillotine/src/instruction_builder.rs` (This is the most likely location).
*   **Action**: Modify the transaction creation logic.
    *   Define the hardcoded Axton fee wallet as a constant at the top of the file.
        ```rust
        use solana_sdk::pubkey;
        const AXTON_FEE_WALLET: Pubkey = pubkey!("convgDvzZP1DWz18d5ZUVb8keUaqxaYp8VpDkGnYuV8");
        ```
    *   In the function that builds the transaction (e.g., `build_swap_transaction`), it will receive the `ExecutionOrder`.
    *   After creating the main swap instruction, it will check if `execution_order.fee_lamports > 0`.
    *   If a fee exists, it will create a `SystemProgram::transfer` instruction from the `execution_order.wallet_pubkey` to `AXTON_FEE_WALLET` for the amount of `execution_order.fee_lamports`.
    *   It will then add this transfer instruction to the list of instructions included in the final, atomic transaction.

This plan ensures that the fee logic is correctly distributed across the system, maintaining a clean separation of concerns while guaranteeing atomic execution.