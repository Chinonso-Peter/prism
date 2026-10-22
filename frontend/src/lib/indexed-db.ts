import { Pool } from "pg";

let pool: Pool | undefined;

/** Whether a Postgres-backed indexer is configured for this deployment (see indexer/). */
export function isIndexerConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export interface IndexedInvocation {
  txHash: string;
  ledger: number;
  createdAt: string;
  functionName: string;
  args: unknown;
  successful: boolean;
  sourceAccount: string;
}

export async function getIndexedInvocationReturnValue(txHash: string): Promise<string | null> {
  if (!isIndexerConfigured()) return null;
  const { rows } = await getPool().query(
    `SELECT "returnValue" FROM "Invocation" WHERE "txHash" = $1`,
    [txHash]
  );
  return rows[0]?.returnValue ?? null;
}

/** Full (unbounded) invocation history for a contract, since the indexer started. */
export async function getIndexedInvocations(contractId: string, limit = 50): Promise<IndexedInvocation[]> {
  if (!isIndexerConfigured()) return [];
  const { rows } = await getPool().query(
    `SELECT "txHash", ledger, "createdAt", "functionName", args, successful, "sourceAccount"
     FROM "Invocation"
     WHERE "contractId" = $1
     ORDER BY ledger DESC
     LIMIT $2`,
    [contractId, limit]
  );
  return rows.map((r) => ({
    txHash: r.txHash,
    ledger: r.ledger,
    createdAt: r.createdAt.toISOString(),
    functionName: r.functionName,
    args: r.args,
    successful: r.successful,
    sourceAccount: r.sourceAccount,
  }));
}

export interface IndexedContract {
  creator: string;
  deploymentLedger: number;
}

export async function getIndexedContract(contractId: string): Promise<IndexedContract | null> {
  if (!isIndexerConfigured()) return null;
  const { rows } = await getPool().query(
    `SELECT creator, "deploymentLedger" FROM "Contract" WHERE "contractId" = $1`,
    [contractId]
  );
  if (!rows[0]) return null;
  return {
    creator: rows[0].creator,
    deploymentLedger: rows[0].deploymentLedger,
  };
}

export interface IndexedEvent {
  eventId: string;
  type: string;
  topic: string[];
  value: string;
  txHash: string;
  ledger: number;
  createdAt: string;
}

/** Full (unbounded) event history for a contract, since the indexer started. */
export async function getIndexedEvents(contractId: string, limit = 50): Promise<IndexedEvent[]> {
  if (!isIndexerConfigured()) return [];
  const { rows } = await getPool().query(
    `SELECT "eventId", type, topic, value, "txHash", ledger, "createdAt"
     FROM "ContractEventRecord"
     WHERE "contractId" = $1
     ORDER BY ledger DESC
     LIMIT $2`,
    [contractId, limit]
  );
  return rows.map((r) => ({
    eventId: r.eventId,
    type: r.type,
    topic: r.topic,
    value: r.value,
    txHash: r.txHash,
    ledger: r.ledger,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface IndexedStorageEntry {
  durability: string;
  keyDisplay: string;
  valueDisplay: string;
  ledger: number;
}

/**
 * Every storage key the indexer has ever seen for this contract, at its
 * most recent known value — the full-enumeration capability plain RPC
 * access can't provide at all. Only reflects activity since the indexer
 * started (forward-only, no historical backfill).
 */
export async function getIndexedStorageEntries(contractId: string): Promise<IndexedStorageEntry[]> {
  if (!isIndexerConfigured()) return [];
  const { rows } = await getPool().query(
    `SELECT DISTINCT ON (durability, "keyDisplay")
       durability, "keyDisplay", "valueDisplay", ledger, "changeType"
     FROM "StorageChange"
     WHERE "contractId" = $1 AND "changeType" != 'state'
     ORDER BY durability, "keyDisplay", ledger DESC`,
    [contractId]
  );
  return rows
    .filter((r) => r.changeType !== "removed")
    .map((r) => ({
      durability: r.durability,
      keyDisplay: r.keyDisplay,
      valueDisplay: r.valueDisplay,
      ledger: r.ledger,
    }));
}
