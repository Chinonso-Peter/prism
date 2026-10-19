# Prism Indexer

An optional, forward-only indexer that polls Soroban RPC and persists contract invocations, storage changes, and events into PostgreSQL. It removes the RPC node's ~24-hour retention limit and enables full storage-key enumeration — neither of which is possible with plain RPC access.

## Quick Start

```bash
cd indexer
npm install

# Set the database connection string
export DATABASE_URL="postgresql://user:password@localhost:5432/prism"

# Generate the Prisma client and run migrations
npm run prisma:generate
npm run prisma:migrate

# Start the indexer (watch mode)
npm run dev
```

Or run everything together with Docker Compose from the repository root:

```bash
docker compose up
```

## Configuration

| Environment Variable | Default                              | Description                          |
| -------------------- | ------------------------------------ | ------------------------------------ |
| `DATABASE_URL`       | *(required)*                         | PostgreSQL connection string         |
| `SOROBAN_RPC_URL`    | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint to poll        |
| `POLL_INTERVAL_MS`   | `5000`                               | Milliseconds between poll cycles     |

## How It Works

1. On first run, the indexer seeds a cursor (`IndexerCursor`) at the current latest ledger. **No historical backfill is performed.**
2. Each poll cycle fetches new transactions from the RPC node, processes them in pages of 50, and advances the cursor.
3. Processing is idempotent — `skipDuplicates` on insert means a crash-before-cursor-advance is safe to replay.

### Cursor Model

The cursor is a single row (`id = 1`) tracking the last fully-processed ledger. It is **forward-only**: the indexer never revisits ledgers before its start point. If you need historical data, you must have been running the indexer at the time.

## Tables

### `indexer_cursor`
Singleton row (id always 1) tracking how far the indexer has processed.

| Column      | Type     | Description                    |
| ----------- | -------- | ------------------------------ |
| `lastLedger` | `Int`   | Last fully-processed ledger    |
| `updatedAt`  | `DateTime` | Last cursor advance time     |

### `invocations`
One row per Soroban contract function invocation.

| Column         | Type      | Description                           |
| -------------- | --------- | ------------------------------------- |
| `txHash`       | `String`  | Transaction hash (unique)             |
| `ledger`       | `Int`     | Ledger sequence number                |
| `contractId`   | `String`  | Contract address                      |
| `functionName` | `String`  | Invoked function name                 |
| `args`         | `Json`    | Decoded arguments                     |
| `successful`   | `Boolean` | Whether the invocation succeeded      |
| `sourceAccount`| `String`  | Transaction source account            |

### `storage_changes`
Append-only log of every observed change to a contract storage entry. The "current value" for a key is its most recent non-removed row — this is what makes full key enumeration possible.

| Column        | Type     | Description                                      |
| ------------- | -------- | ------------------------------------------------ |
| `contractId`  | `String` | Contract address                                 |
| `durability`  | `String` | `persistent` / `temporary` / `instance`          |
| `keyDisplay`  | `String` | Human-readable decoded key                       |
| `valueDisplay`| `String` | Decoded value (null when removed)                |
| `changeType`  | `String` | `created` / `updated` / `removed` / `state`      |
| `ledger`      | `Int`    | Ledger sequence number                           |
| `txHash`      | `String` | Transaction hash                                 |

### `contract_event_records`
One row per contract event emitted.

| Column       | Type     | Description                    |
| ------------ | -------- | ------------------------------ |
| `eventId`    | `String` | Unique event identifier        |
| `contractId` | `String` | Contract address               |
| `type`       | `String` | Event type                     |
| `topic`      | `Json`   | Event topics                   |
| `value`      | `String` | Event value (decoded)          |

## Failure Behaviour

- **Crash before cursor advance**: Safe. The next run reprocesses the same page; `skipDuplicates` prevents double-inserts.
- **RPC unreachable**: The indexer retries on the next poll cycle. No data is lost — the cursor only advances after successful processing.
- **Database unreachable**: The indexer throws and exits. Restart after the database is available; the cursor is preserved.

## Retention Gap

Because the indexer is forward-only, it only has data from the ledger at which it started. For contracts that existed before the indexer ran, invocation and event history will be incomplete. Storage changes observed after the indexer started are complete.

## Running Tests

```bash
cd indexer
npm test
```

Tests cover the XDR decoder (`decode.test.ts`) — the most correctness-critical component, which turns raw transaction envelopes into typed invocation/storage/event records.
