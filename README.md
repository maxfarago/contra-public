# contra

contra: a live-controlled solana trading bot with a deck.gl market map. pump.fun + pumpswap, actor-isolated strategies, no restart to create / update / kill a trade.

## overview

rust actors for chain ingestion, orchestration, and execution. fastify for the control plane. typescript + deck.gl for atlas, a scatterplot of every live pump.fun token.

the prod service has been sunsetted. auth, admin, reporting, and ci/cd are not included in this public version of the codebase.

the rust engine is a message-passing actor system: each trade is its own state machine, the executor never talks to rpc, and a dedicated oracle is the only thing that does. that split is what let strategies run concurrently without racing wallet state or starving the hot path on postgres.

## architecture

```
helius ws
        │
        ▼
   ticker (rust)
        │
        ▼
      buffett  ◄── janus ◄── sqs ◄── api (fastify)
        │
        ├─► trades (oneshot / countersell)
        ├─► shylock (rpc oracle + fee cache)
        └─► guillotine
              kms decrypt → sign → submit
                │
           hermes → postgres
                │
                └─► ui (react + deck.gl atlas)
```

- **ticker** — dual helius websockets, pump.fun + pumpswap logs, no business logic. forwards raw tx logs to buffett.
- **janus** — long-polls sqs, unwraps create/update/delete envelopes, hands trusted commands to buffett.
- **buffett** — trade registry and router. parses market ids via rosetta, fans logs out to the trades watching that mint/pool, forwards execution orders to guillotine.
- **trades** — trait-based strategies. oneshot buy/sell and countersell (multi-trigger sells that survive pump.fun → pumpswap migration).
- **shylock** — sole rpc client. caches static accounts, polls priority fees, serves on-demand reserves for price calcs.
- **guillotine** — protocol instruction builder + signer. no rpc. decrypts the hot wallet with kms, simulates, submits.
- **hermes** — fire-and-forget postgres logger, off the trading loop.
- **api** — orders / positions / wallet / token http. commands land on sqs; the rust engine is the consumer.
- **ui** — atlas (age × mcap scatter), trading hud, portfolio.

## license

all rights reserved. source is published for reading, not as a hosted trading service.
