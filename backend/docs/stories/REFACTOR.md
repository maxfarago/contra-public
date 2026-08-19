# 🏗️ Axton - Actor-Based Trading Platform

Axton is a high-performance, actor-based trading platform for Solana, focusing on pump.fun and PumpSwap protocols. Built in Rust, it implements a message-driven architecture that eliminates race conditions and provides robust isolation between trading strategies.

## 🎭 Architecture Overview

Axton is structured as a collection of independent services (actors) that communicate exclusively through well-defined contracts. Each service owns its state and communicates via channels, ensuring data isolation and preventing the race conditions that plagued legacy monolithic designs.

### Core Design Principles

- **Actor Model**: Each service runs as an independent actor with isolated state and message-driven communication
- **Contracts-First**: All inter-service communication happens through well-defined enums/structs
- **Cached + Fresh Data**: Services provide both fast cached reads and on-demand fresh data from RPC
- **At-Least-Once Delivery**: Robust message processing with SQS redelivery and idempotent handling
- **Performance-First**: Direct API access for cached reads, channels for commands and state changes

---

## 🎭 Core Services

### ✅ Janus (Front Door / Gateway)

**Gateway service that translates external commands into internal messages**

- Listens on SQS for user commands (create/update/delete trades)
- Translates external JSON payloads into internal `BuffettCommand` messages
- Implements at-least-once delivery with SQS long polling (20s wait time)
- Only deletes SQS messages after confirmed delivery to Buffett's channel

**Key Features:**

- SQS long polling with exponential backoff on failures
- Idempotent message processing (trades can handle duplicate creation requests)
- Centralized trade config parsing with support for Countersell, OneShotBuy, OneShotSell
- Error resilience with automatic retry and dead letter queue support

### ✅ Buffett (Trade Orchestrator / Broker)

**Central orchestrator that manages the lifecycle of all trading strategies**

- Owns the `TradeRegistry`, which manages all `TradeActor`s.
- Initializes, activates, deactivates, and shuts down Trades by spawning and managing `TradeActor`s.
- Forwards `ExecutionOrder`s from `TradeActor`s to `Guillotine` for transaction execution.
- Routes `ExecutionResult`s from `Guillotine` to `TradeActor`s for state management.
- Persists lifecycle events and trade metadata via `Hermes`.
- Coordinates between all services while maintaining their isolation.

### ✅ Trade (Strategy Implementations)

**Individual trading strategy actors that implement the core business logic**

- Implement the `Trade` trait defined in `trades/src/lib.rs`.
- Examples: OneShotBuy, OneShotSell, Countersell.
- Each `Trade` runs inside a `TradeActor` harness with:
  - An input mailbox for transaction streams.
  - An output channel to send `ExecutionOrder`s to `Guillotine` (via `Buffett`).
  - A channel to receive `ExecutionResult`s.
  - Internal state management.
- Trades emit lifecycle events when appropriate.
- Direct access to `Shylock` for fast cached reads of fees.

### ✅ Guillotine (Transaction Executor)

**Secure transaction building and execution service**

- Owns encrypted wallet private keys and handles all cryptographic operations
- Builds, signs, and sends transactions to Solana RPC endpoints
- Supports transaction preflight simulation for validation
- Returns ExecutionResult messages to Buffett after transaction confirmation
- Implements retry logic and fee escalation for failed transactions

### ✅ Hermes (Persistence Layer)

**Database service that handles all persistent state**

- Owns all database I/O operations with PostgreSQL via sqlx
- Buffers writes and processes queries from other services
- Preserves proven business logic from legacy systems:
  - Trade status tracking and lifecycle management
  - Order status updates and partial fill tracking
  - Countersell order sold amount increments
  - OneShot order finalization with result amounts
  - Structured logging with trade-specific context

### ⏳ Shylock (Oracle / RPC Gateway)

**High-performance caching service for Solana chain data**

Shylock provides both cached and fresh access to critical trading data with a hybrid API designed for speed. Trades access cached data directly via Arc references while using channels for commands and fresh data requests.

**Core Responsibilities:**

- **Token-Level Priority Fee Estimates**: 3-second refresh cycles for fast-moving fee markets
- **Program-Level Dynamic Fee Configuration**: 2-minute refresh for pump.fun/PumpSwap fee structures
- **Program-Level Global State**: Hourly refresh for stable configuration data

**Architecture:**

- **Direct API Access**: Trades call methods directly on `Arc<Shylock>` for cached reads
- **Channel Commands**: Token registration/deregistration via mpsc channels
- **Multi-Layer Caching**: Arc<RwLock<HashMap>> for instant reads, background refresh loops
- **Automatic Cleanup**: Tokens with zero registered trades get removed from tracking

**Token Registration Flow:**

1.  **✅ Trade starts → sends `RegisterToken` command via channel**
2.  **✅ Shylock adds token to active tracking list**
3.  **⏳ Background refresh loops begin tracking the new token**
4.  **✅ Trade completes → sends `DeregisterToken` command**
5.  **✅ Shylock removes token from tracking if no other trades need it**

---

## 🔄 Inter-Service Communication

All communication happens through contracts defined in `commons/contracts.rs`, ensuring type safety and clear service boundaries.

---

## 🚀 End-to-End Trading Flow

1.  **✅ Command Ingestion**: `Janus` receives SQS message → parses JSON → sends `BuffettCommand::CreateTrade`.
2.  **✅ Trade Initialization**: `Buffett` spawns a `TradeActor` with an isolated mailbox and output channel. The actor calls `initialize` and `activate` on its underlying `Trade`.
3.  **✅ Token Registration**: Trade registers required tokens with `Shylock` for fee tracking.
4.  **✅ Transaction Preprocessing**: `Ticker` ingests transactions, `Buffett` parses them and sends them to the appropriate `TradeActor`'s mailbox.
5.  **✅ Strategy Execution**: The `Trade`'s `activate` or `process_logs` method runs, updating internal state and emitting an `ExecutionOrder`.
6.  **✅ Order Routing**: The `TradeActor` sends the `ExecutionOrder` to `Buffett`, the central orchestrator.
7.  **✅ Transaction Execution**: `Buffett` receives the order, logs it for system-wide observability, and forwards it to `Guillotine` for signing and submission.
8.  **✅ Result Processing**: `Guillotine` returns `ExecutionResult` to `Buffett`.
9.  **✅ State Updates**: `Buffett` forwards the result to the correct `TradeActor`, which calls `on_result` to update its internal state. `Hermes` persists the result.
10. **✅ Completion**: `Trade` completes, actor sends `BuffettCommand::TradeComplete`. `Buffett` deactivates the actor.
11. **✅ Cleanup**: `Trade` deregisters tokens from `Shylock`, `Hermes` finalizes database records.

---

## ✅ Key Architectural Benefits

**Race Condition Elimination**

- Actor model with isolated state prevents data races
- Message-driven communication ensures deterministic state updates
- No shared mutable state between services

**Performance Optimization**

- Direct API access for cached reads (no serialization overhead)
- Background refresh loops keep caches warm
- Batch RPC requests for efficiency

**Reliability & Resilience**

- At-least-once delivery with SQS redelivery
- Idempotent message processing
- Graceful degradation (stale cache better than blocked trades)

**Maintainability & Testing**

- Clear service boundaries with contract-first design
- Easy to unit test individual services in isolation
- Business logic preserved from proven legacy implementations

**Scalability**

- Independent service scaling based on load patterns
- Stateless services can be horizontally scaled
- Database writes isolated to single service (Hermes)