### Implementation Plan: Actor Self-Sufficiency for `Countersell`

The goal of this refactor is to make the `Countersell` actor self-sufficient by storing all necessary static on-chain data in its local `TokenContext`. This eliminates the race condition with `Shylock`'s polled cache, removes unnecessary network calls, and improves the robustness and performance of the system.

#### 1. `commons/src/types.rs`

*   **Action**: Enhance `TokenContext` to store all static, token-specific data.
*   **Change**: Add the `creator: Option<Pubkey>` field. The `creator` of a bonding curve is immutable and belongs with the other static identifiers for the token.

#### 2. `trades/src/protocol_detector.rs`

*   **Action**: Enrich the `TokenContext` at the point of creation.
*   **Change**: When `detect_token_protocol` identifies a `pump.fun` token, it will not only get the bonding curve account but also *deserialize* it to extract the `creator` pubkey. This `creator` will then be used to populate the new field in the `TokenContext` that is returned. This ensures all static `pump.fun` data is captured at initialization.

#### 3. `trades/src/examples/countersell/execute.rs`

*   **Action**: Completely refactor `generate_sell_order` to be self-reliant and remove the flawed dependency on `Shylock`.
*   **Change**:
    *   The function signature will be simplified. It will no longer need to accept `_triggering_buy_lamports`, `_market_cap_at_sell_lamports`, or `_triggering_buy_signature`, as these were only passed through for the now-unnecessary `Shylock` call.
    *   The entire block that sends `ShylockCommand::GetCachedTokenData` and awaits a response will be **deleted**.
    *   The `match protocol` block will be rewritten:
        *   The `PumpFun` arm will now retrieve the `market_address` (bonding curve) and `creator` directly from the actor's local `TokenContext`.
        *   The `PumpSwap` arm will retrieve the `market_address` (pool) and vault addresses directly from the `TokenContext`.
    *   The final `ExecutionOrder` struct will be populated using only this locally-sourced data. `global_state` and `coin_creator` will be set to `None` as `Guillotine` is responsible for fetching any remaining necessary on-chain data.

#### 4. `commons/src/contracts.rs`

*   **Action**: Update the `ExecutionOrder` struct to reflect the new division of responsibilities.
*   **Change**: Several fields are now redundant as `Guillotine` will fetch them. The following fields will be removed from the `ExecutionOrder` struct:
    *   `creator: Option<Pubkey>`
    *   `global_state: Option<Global>`
    *   `coin_creator: Option<Pubkey>`
    *   `pool_base_token_account: Option<Pubkey>`
    *   `pool_quote_token_account: Option<Pubkey>`

This plan will result in a more robust, efficient, and architecturally sound system. I will now save this plan to the markdown file.