# Axton: Actor-Based Solana Trading Bot

## High-Level System Overview

`axton` is an automated, modular trading bot designed for high-performance operation on the Solana blockchain. Architected in Rust, it implements a **message-driven, actor-based design** that provides robust isolation between trading strategies and eliminates race conditions. Its primary function is to ingest real-time event data via its `Ticker` service, route it through the `Buffett` orchestrator to the appropriate trading strategies, and execute transactions via the `Guillotine` executor.

A key feature of Axton is its ability to be managed on-the-fly. Strategies can be **created, updated, and deleted live** by sending commands to an **AWS SQS message queue**, which are ingested by the `Janus` gateway. All critical events are persisted to an external database via a dedicated, non-blocking `Hermes` service for full observability.

## Core Architectural Components

The system is designed with a clear separation of concerns, split into a collection of independent services (actors) that communicate exclusively through message-passing over asynchronous channels.

### 1. `Ticker`: The High-Frequency Event Ingester

- **Core Function:** `Ticker` is the system's sensory input, responsible for ingesting real-time on-chain data from both `pump.fun` and `pumpswap` protocols simultaneously via dual Helius WebSocket connections.
- **Process:**
  - Maintains two concurrent WebSocket connections to Helius RPC.
  - Receives raw transaction logs for all activity on the monitored protocols.
  - Performs no business-logic filtering. It immediately forwards the raw `TransactionData` (signature and logs) to the `Buffett` orchestrator for routing.
- **Output:** A high-throughput stream of raw transaction data sent to `Buffett`.

### 2. `Janus`: The SQS Command Gateway

- **Core Function:** The `Janus` crate is the system's gateway, responsible for translating external commands from an AWS SQS queue into the internal message protocol.
- **Process:**
  - Securely polls a specified AWS SQS queue using long polling.
  - Receives JSON-based commands (e.g., `CREATE_TRADE`, `DELETE_TRADE`).
  - Parses the command *envelope* and forwards the trade configuration payload to the `Buffett` orchestrator as a trusted, internal command.
- **Output:** `BuffettCommand` messages sent to `Buffett`.

### 3. `Buffett`: The Trade Orchestrator

- **Core Function:** `Buffett` is the central orchestrator that manages the lifecycle of all trading strategies. It acts as the system's brain, routing commands, on-chain data, and execution orders to the correct destinations.
- **Process:**
  - Receives `BuffettCommand` messages from `Janus` to create, update, or delete trades.
  - Receives the raw `TransactionData` stream from `Ticker`.
  - Uses the `Rosetta` parser to extract market identifiers (token mints or pool addresses) from the transaction logs.
  - Routes the transaction data to the specific trades that are monitoring the affected market addresses.
  - Receives `ExecutionOrder`s from `Trade` actors and forwards them to `Guillotine` for execution, providing a single point of control and observability.
- **Output:** Dispatches transaction data to active trades and forwards `ExecutionOrder`s from trades to the `Guillotine` executor.

### 4. `trades`: The Protocol-Aware Decision Logic Core

- **Core Function:** `trades` provides a trait-based framework for implementing trading logic. Each trade is a self-contained state machine, responsible for its own protocol detection, migration handling, and dynamic state management. When a trade decides to execute, it emits an `ExecutionOrder` to `Buffett`.
- **Simplified `Trade` Trait:** All trades implement:
  ```rust
  #[async_trait::async_trait]
  pub trait Trade: Send + Sync {
      fn id(&self) -> &str; // Unique identifier for the trade instance
      fn name(&self) -> &str;
      fn monitored_token(&self) -> Pubkey;
      async fn is_active(&self) -> bool;
      // ... and methods for processing events and handling state changes
  }
  ```
- **Current Implementation:** Includes a `Countersell` trade that can manage multiple sell orders for a single token. When it receives transaction data from `Buffett`, it uses the `Rosetta` parser for a deep analysis of the events to determine if its sell conditions have been met.

### 5. `Guillotine`: The Dynamic Transaction Executor

- **Core Function:** `guillotine` receives abstract trade commands (`ExecutionOrder`s) from `Buffett` and executes them as protocol-specific Solana transactions. It is a pure, high-performance execution engine that performs **no RPC calls**.
- **Process:**
  - Receives a complete `ExecutionOrder` containing all necessary on-chain data, pre-fetched by `Shylock`.
  - Dynamically routes commands to self-contained `pump.fun` or `pumpswap` modules to build the required transaction instructions.
  - Fetches the latest priority fee for the target token from a shared cache.
  - Handles complex account management, PDA derivation, and ATA creation.
  - Always simulates transactions before submission to catch errors early.
- **Output:** Signed transactions broadcasted to the Solana network.

### 6. `Shylock`: The High-Performance Data Oracle

- **Core Function:** `Shylock` is the system's dedicated data oracle and **RPC gateway**, responsible for providing fast, reliable on-chain data to other services. It is the **single source of truth** for all on-chain information, abstracting away all direct `RpcClient` dependencies from the core trading logic.
- **Process:**
  - Runs background tasks to periodically poll and cache priority fees for actively monitored tokens.
  - Upon a trade's registration, it performs a one-time fetch of all required *static* on-chain data (e.g., `Global` state, program addresses) and caches it for the lifetime of the trade.
  - **Handles on-demand requests for fresh, dynamic data.** For time-sensitive operations like a `OneShot` trade's price calculation, actors can request that `Shylock` fetch live data (e.g., token pool reserves) directly from an RPC node, ensuring the trade acts on the most current information.
  - Manages data polling and subscriptions based on `RegisterToken` and `DeregisterToken` commands from `Trade` actors.
  - Exposes a unified request-response channel API for other actors to query both low-latency cached data and on-demand fresh data, ensuring no other service ever needs direct RPC access.
- **Output:** A stream of low-latency priority fees, cached static data, and on-demand fresh on-chain data for actors like `Guillotine` and `trades`.

### 7. `Hermes`: The Asynchronous Observability Layer

- **Core Function:** `Hermes` is the system's dedicated I/O service, responsible for persisting all critical application events to an external database (e.g., AWS RDS) for real-time observability.
- **Process:**
  - Runs as an independent background worker, completely decoupled from the trading loop.
  - Receives structured data commands via a non-blocking `tokio::mpsc` channel and persists them to a Postgres database.
- **Output:** A structured, queryable history of all bot operations.

### 8. `Rosetta`: The Protocol Parser Utility

- **Core Function:** `Rosetta` is a pure utility crate that acts as the single source of truth for decoding on-chain data. It contains no services or background tasks.
- **Responsibilities:**
  - Defines the Rust structs that mirror on-chain program accounts and event structures (`TradeEvent`, `BuyEvent`, `Global`, etc.).
  - Provides functions to parse raw transaction logs into these high-level, structured types.
- **Usage:** Used by `Buffett` for high-level routing and by individual `Trades` for detailed event analysis.

## Dynamic Command & Control via SQS

Axton's behavior is not hardcoded; it is managed live via an AWS SQS queue.

### Workflow

1.  **Command Generation:** An external process constructs a JSON command.
2.  **Queueing:** The JSON command is sent as a message to the SQS queue.
3.  **Ingestion & Execution:** Axton's `Janus` gateway receives the message, validates the command envelope, and forwards it to the `Buffett` orchestrator for execution. The changes take effect immediately.

This updated `README.md` now accurately reflects the current, refactored architecture.