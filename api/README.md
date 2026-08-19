# Axton API

Control plane for contra. Fastify HTTP for orders, positions, wallet, and token metadata. Trade commands are published to SQS and consumed by the rust engine.

the telegram login bot, `/auth/*` routes, and aws provisioning are not included in this public cut.

## Key Technologies

- **Backend**: Node.js
- **Framework**: Fastify
- **Containerization**: Docker
- **Database**: PostgreSQL
- **Encryption**: AWS KMS for private key storage
- **Blockchain Data**: Helius API for real-time on-chain data

## Application Architecture

The application is a monolithic Node.js server built with the Fastify framework.

- `src/app.js`: The core Fastify application factory. It uses `@fastify/autoload` to dynamically load all plugins and routes.
- `src/server.js`: The main entry point for the application, responsible for starting the server.
- `src/plugins/`: Shared logic via Fastify's decorator pattern — database (`db.js`), SQS (`sqs.js`), JWT verify (`auth.js`).
- `src/routes/`: Endpoint handlers, automatically prefixed with `/v1`.

## Database Schema

The database is PostgreSQL. The schema is defined in `db/tables.sql` and includes the following key tables:

- `account`: Stores user information, including encrypted private keys.
- `token`: Token metadata including name, symbol, image, and decimals.
- `position_order`: Current trading orders and configurations.
- `order_tx`: Individual transaction records for order execution.
- `position`: Materialized view aggregating user holdings and PnL by token.
- `log`: Records events and errors for debugging and user visibility.

## Development Environment

### Prerequisites

- Node.js
- Docker

### Setup

1.  **Install dependencies**:

    ```bash
    npm install
    ```

2.  **Local Development**:
    The project uses `nodemon` for live reloading during development. The local environment requires environment variables for database connections and secrets.

    To start the local server:

    ```bash
    npm run dev
    ```

    This command runs `node src/server.js` and watches for changes in the `src/` directory.

## API Endpoints

All routes are prefixed with `/v1`.

### Wallet Management

- `POST /wallet`: Creates a new Solana wallet.
- `GET /wallet`: Retrieves wallet information including token holdings and balances.

Orders, positions, and token routes live alongside these.

## Environment Variables

See `.env.example`. Key values:

- `DB_CXN_STRING`: PostgreSQL connection string.
- `JWT_SECRET`: Secret key for JWT signing.
- `KMS_KEY_ID`: AWS KMS key ID for encrypting private keys.
- `HELIUS_API_KEY`: API key for Helius Solana RPC service.
- `SQS_QUEUE_URL`: SQS queue URL for trade commands.