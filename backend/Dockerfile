# stage 1: builder
FROM rust:slim-bookworm AS builder

# set the working directory
WORKDIR /usr/src/axton

# install system dependencies required for the build, specifically for the openssl-sys crate
RUN apt-get update && apt-get install -y libssl-dev pkg-config

# copy the entire backend source code into the container
COPY . .

# build the application for release
RUN cargo build --verbose --release --target=x86_64-unknown-linux-gnu

# stage 2: runner
FROM debian:bookworm-slim

# install ca-certificates, which is a common dependency for applications making secure HTTPS/WSS connections
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# for security best practices, we create a non-root user to run the application
RUN groupadd --system app && useradd --system --gid app app
USER app

# set the working directory for the runner stage
WORKDIR /app

# copy the compiled binary from the build context
COPY --from=builder /usr/src/axton/target/x86_64-unknown-linux-gnu/release/axton .

# set the command to run the application when the container starts
CMD ["./axton"]