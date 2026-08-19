# Atlas Real-time Token Visualizer

This repository contains a full-stack, real-time data visualization application named **Atlas**. Its primary function is to monitor the Solana blockchain for newly created tokens on the pump.fun platform, enrich this data with market information, and display it on an interactive, web-based scatter plot.

The architecture is divided into three distinct applications: a Rust-based **Ingestion Service**, a TypeScript **API Service**, and a React-based **Frontend UI**.

---

### Application Breakdown

#### 1. Backend: Ingestion Service (`ingestion/`)

This is the data source and the first step in the pipeline.

*   **Technology**: Built in **Rust** for high performance and reliability.
*   **Core Responsibilities**:
    *   **Real-time Discovery**: It establishes a persistent WebSocket connection to a Helius RPC endpoint to monitor the Solana blockchain in real-time.
    *   **Initial Processing**: When it identifies a transaction for a new token creation, it extracts the essential, raw metadata (e.g., mint address, creation timestamp).
    *   **Data Hand-off**: It immediately writes this basic data to a **Redis** sorted set (`tokens:live`) for persistence and publishes the new token's mint address to a Redis pub/sub channel named `token:discovered`. This acts as a signal to the API service that new data is available.

#### 2. Backend: API Service (`api/`)

This service acts as the central hub, processing the raw data and serving it to the client.

*   **Technology**: Built in **TypeScript** using the **Fastify** web framework.
*   **Core Responsibilities**:
    *   **Data Subscription**: It subscribes to the `token:discovered` channel in Redis. When it receives a new mint address, it knows to begin the enrichment process.
    *   **Data Enrichment**: It runs a continuous polling loop (every 2 seconds) that queries an external API (Jupiter) for market data (market cap, price, holder count) for all recently discovered tokens.
    *   **State Management**: It stores this enriched data back into Redis, associating it with the original token's mint address.
    *   **WebSocket Server**: It hosts the primary WebSocket endpoint (`/ws`) that the frontend connects to. It streams the complete, enriched token data to all connected clients at regular intervals.
    *   **Health Check**: It exposes a crucial `/health` endpoint that checks its own status and its connection to Redis. This is used by the production load balancer to verify the service is healthy.

#### 3. Frontend: User Interface (`ui/`)

This is the user-facing, visual component of the application.

*   **Technology**: Built with **React** and **TypeScript**, using **Vite** as the build tool. The charting is handled by the **Recharts** library.
*   **Core Responsibilities**:
    *   **WebSocket Client**: It establishes a WebSocket connection to the API service to receive the real-time stream of token data.
    *   **Data Visualization**: It renders the token data as a scatter plot, where axes represent metrics like token age and market cap.
    *   **Interactive Experience**: It provides an interactive Heads-Up Display (HUD) to show details of a selected token and allows users to change visualization parameters via keyboard shortcuts.
    *   **Smooth Animation**: It uses an interpolation loop to smoothly animate the data points on the chart as new data arrives, creating a fluid and professional user experience.

---

### Deployment Architecture & CI/CD

The entire deployment process is automated via **GitHub Actions**, with separate, parallel workflows for the backend and frontend.

#### Backend Deployment (`.github/workflows/deploy-backend.yml`)

The backend is deployed to a single **EC2 instance** fronted by an **Application Load Balancer (ALB)**.

*   **Trigger**: A push to the `master` branch.
*   **Build Process (CI)**:
    1.  The workflow authenticates to AWS.
    2.  It builds Docker images for both the `ingestion` and `api` services using the `docker/build-push-action`.
    3.  **Crucially, the Rust `ingestion` build is heavily optimized**. The Dockerfile is structured to cache the compiled dependencies, reducing build times from ~10 minutes to ~1-2 minutes for typical code changes. It also uses ECR as a persistent cache backend.
    4.  The newly built images are pushed to **Amazon ECR** and tagged with the unique Git commit SHA.
*   **Deployment Process (CD)**:
    1.  A separate job in the workflow authenticates to AWS again.
    2.  It uses the `peterkimzz/aws-ssm-send-command` action to securely execute a script on the production EC2 instance **without needing SSH keys**.
    3.  The script on the EC2 instance performs the following:
        *   Authenticates to ECR.
        *   Exports the new image tags as environment variables.
        *   Runs `docker compose pull` to download the new images.
        *   Runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` to restart the services with the new images. This uses a production-specific override file to point to the ECR images instead of building from source.
*   **Infrastructure**: The DNS record `atlas-api.contra.trade` points to the ALB, which listens on port 443 (handling SSL) and forwards traffic to the EC2 instance on port 3000 based on the Host header.

#### Frontend Deployment (`.github/workflows/deploy-ui.yml`)

The frontend is deployed as a static site to **S3** and served globally via **CloudFront**.

*   **Trigger**: A push to the `master` branch that includes changes in the `ui/` directory.
*   **Deployment Process (CI/CD)**:
    1.  The workflow authenticates to AWS.
    2.  It installs Node.js dependencies.
    3.  It **injects the production WebSocket URL** (`wss://atlas-api.contra.trade`) into a `.env.production` file. This is sourced from a GitHub secret.
    4.  It runs `npm run build` to create the optimized, static HTML, CSS, and JavaScript files.
    5.  It syncs the contents of the `dist/` directory to the designated **S3 bucket**.
    6.  It creates a **CloudFront invalidation** for `/*`, forcing the CDN to pull the new files from S3 and ensuring users see the latest version immediately.
*   **Infrastructure**: The DNS record `atlas.contra.trade` points to the CloudFront distribution, which serves the content securely from the S3 bucket using Origin Access Control (OAC).