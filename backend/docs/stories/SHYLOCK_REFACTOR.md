# Shylock Refactor Plan

This document outlines a planned refactoring of the `Shylock` service to improve architectural purity and align with the actor model's principle of keeping service roles as focused as possible.

## Current State Analysis

Currently, the responsibility for fetching priority fees is split:

1.  `Shylock` is the central caching oracle that polls and stores priority fees for actively traded tokens.
2.  `TradeActor`s generate `ExecutionOrder`s that do **not** contain a priority fee.
3.  `Guillotine` receives an `ExecutionOrder`, and before executing it, it sends a `FeeRequest` to `Shylock` to get the latest fee.

This design was likely a pragmatic choice to simplify the dependency graph, as only `Guillotine` needs a channel to request fees from `Shylock`. However, it gives `Guillotine` more responsibility than a "dumb" executor should have.

## Proposed Architectural Change

The core of this refactor is to **shift the responsibility of fee fetching from `Guillotine` to the `TradeActor`**.

A `TradeActor` is the component with the strategic knowledge. It decides *when* to trade and *what* to trade. It should also be responsible for deciding *how* to trade, which includes specifying the priority fee. `Guillotine`'s role should be reduced to purely executing a fully-formed, ready-to-go order.

**The new workflow will be:**

1.  When a `TradeActor` is initialized, it receives a direct, read-only handle (`Arc`) to `Shylock`'s priority fee cache.
2.  When the trade logic decides to execute, it reads the latest fee directly from the cache.
3.  It constructs an `ExecutionOrder` that **includes the priority fee**.
4.  It sends this complete order to `Buffett`, who forwards it to `Guillotine`.
5.  `Guillotine` receives the order and executes it directly, without needing to communicate with `Shylock`.

## Action Plan

### 1. Centralize Communication Contracts

*   [ ] Move the `FeeRequest` enum from `shylock/src/types.rs` to `commons/src/contracts.rs`.
*   [ ] Delete the unused `PriorityFeeResponse` and `PriorityFeeResult` structs from `shylock/src/types.rs`.
*   [ ] Delete the `shylock/src/types.rs` file and update module references in `shylock/src/lib.rs`.

### 2. Update the `ExecutionOrder`

*   [ ] Add a new field to the `ExecutionOrder` struct in `commons/src/contracts.rs`:
    ```rust
    pub priority_fee: u64,
    ```

### 3. Refactor `Shylock` for Direct Cache Access

*   [ ] In `shylock/src/lib.rs`, make the `current_fees` cache publicly accessible or provide a getter method that returns `Arc<RwLock<HashMap<Pubkey, u64>>>`.
*   [ ] The main `Shylock` struct should expose a way to clone its fee cache `Arc`.

### 4. Update `Buffett` to Propagate the Cache Handle

*   [ ] The `Buffett` actor will need to hold an `Arc` to `Shylock`'s fee cache. This will likely be passed in during `Buffett`'s initialization in `src/app.rs`.
*   [ ] In `buffett/src/handlers.rs`, when a `TradeActor` is spawned (`handle_create_trade`), `Buffett` must pass its handle to the `Shylock` cache into the new `TradeActor`.

### 5. Update `TradeActor` and Trade Logic

*   [ ] The `TradeActor` struct in `trades/src/actor.rs` will need to store the `Arc` to the `Shylock` cache.
*   [ ] The underlying `Trade` trait and its implementations (e.g., `Countersell`) will need a way to access this cache when building an `ExecutionOrder`.
*   [ ] All `ExecutionOrder` creation logic within the trade implementations must be updated to read from the cache and populate the new `priority_fee` field.

### 6. Simplify `Guillotine`

*   [ ] Remove the logic from `Guillotine` that sends a `FeeRequest` to `Shylock`.
*   [ ] `Guillotine`'s `start` or `new` function will no longer need a sender channel for `FeeRequest`.
*   [ ] Update the transaction building logic in `Guillotine` to use the `priority_fee` from the `ExecutionOrder` directly.

### 7. Cleanup

*   [ ] With `Guillotine` no longer sending `FeeRequest`s, the `fee_request_receiver` in `Shylock` can be removed.
*   [ ] The corresponding `select!` branch and `handle_fee_request` function in `shylock/src/lib.rs` can be deleted.
*   [ ] Update the application wiring in `src/app.rs` to reflect these changes (e.g., no longer creating the `fee_request` channel).
