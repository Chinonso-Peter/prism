import { rpc, encodeMuxedAccountToAddress, type xdr } from "@stellar/stellar-sdk";
import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { prisma, findCursor, seedCursor, setCursor, type Db } from "./db.js";
import {
  decodeContractCreation,
  decodeInvocation,
  extractEvents,
  extractInvocationReturnValue,
  extractStorageChanges,
} from "./decode.js";

const RPC_URL = process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 8080);
const MAX_LEDGER_LAG = Number(process.env.HEALTH_MAX_LEDGER_LAG ?? 60);
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
export const PAGE_LIMIT = 50;

export const server = new rpc.Server(RPC_URL, { timeout: 10_000 });

let stopping = false;
let wakeFromSleep = (): void => {};

/** Sleep that a shutdown signal can cut short. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    wakeFromSleep = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

/**
 * Delay before the next poll after `failures` consecutive failures: exponential
 * from BACKOFF_BASE_MS, capped at BACKOFF_MAX_MS. Equal jitter draws each delay
 * from the upper half of its step, so the range keeps growing with each failure.
 */
export function backoffDelay(failures: number, random: () => number = Math.random): number {
  const step = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
  return Math.round(step / 2 + random() * (step / 2));
}

export interface HealthSnapshot {
  cursor: number;
  latestLedger: number;
  lastPollFailed: boolean;
}

/** Unhealthy when the last poll failed or the cursor trails the network by more than maxLag ledgers. */
export function healthReport(snapshot: HealthSnapshot, maxLag: number) {
  const lag = Math.max(0, snapshot.latestLedger - snapshot.cursor);
  const healthy = !snapshot.lastPollFailed && lag <= maxLag;
  return { healthy, ...snapshot, lag };
}

/**
 * The last-processed ledger to seed a fresh cursor with. Without INDEXER_START_LEDGER
 * that is the network's latest ledger. With it, indexing begins at that ledger, which
 * must lie inside the RPC node's retention window or the poll would hit the gap branch.
 */
export function seedLastLedger(
  raw: string | undefined,
  network: { latestLedger: number; oldestLedger: number }
): number {
  if (raw === undefined || raw.trim() === "") return network.latestLedger;
  const start = Number(raw);
  if (!Number.isSafeInteger(start) || start < 1) {
    throw new Error(`INDEXER_START_LEDGER must be a positive integer, got "${raw}"`);
  }
  if (start < network.oldestLedger || start > network.latestLedger) {
    throw new Error(
      `INDEXER_START_LEDGER ${start} is outside the RPC node's retention window ` +
        `(ledgers ${network.oldestLedger}-${network.latestLedger})`
    );
  }
  return start - 1;
}

const health: HealthSnapshot = { cursor: 0, latestLedger: 0, lastPollFailed: false };

function startHealthServer(): Server {
  const httpServer = createServer((req, res) => {
    if (req.method !== "GET" || req.url?.split("?")[0] !== "/healthz") {
      res.writeHead(404).end();
      return;
    }
    const report = healthReport(health, MAX_LEDGER_LAG);
    res.writeHead(report.healthy ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(report));
  });
  httpServer.listen(HEALTH_PORT, () => {
    console.log(`[indexer] health endpoint listening on port ${HEALTH_PORT} (GET /healthz)`);
  });
  return httpServer;
}

function requestShutdown(signal: NodeJS.Signals): void {
  console.log(`[indexer] ${signal} received, stopping after the current page`);
  stopping = true;
  wakeFromSleep();
}

function sourceAccountOf(envelope: xdr.TransactionEnvelope): string {
  try {
    const tx =
      envelope.switch().name === "envelopeTypeTxFeeBump"
        ? envelope.feeBump().tx().innerTx().v1().tx()
        : envelope.v1().tx();
    return encodeMuxedAccountToAddress(tx.sourceAccount());
  } catch {
    return "";
  }
}

export async function processTransaction(tx: rpc.Api.TransactionInfo, db: Db = prisma): Promise<void> {
  const createdAt = new Date(tx.createdAt * 1000);
  const invocation = decodeInvocation(tx.envelopeXdr);
  const sourceAccount = sourceAccountOf(tx.envelopeXdr);

  if (invocation) {
    // skipDuplicates makes reprocessing a page after a crash-before-cursor-advance safe.
    await db.invocation.createMany({
      data: [
        {
          txHash: tx.txHash,
          ledger: tx.ledger,
          createdAt,
          contractId: invocation.contractId,
          functionName: invocation.functionName,
          args: invocation.args as object,
          successful: tx.status === "SUCCESS",
          sourceAccount,
          returnValue:
            tx.status === "SUCCESS" ? extractInvocationReturnValue(tx.resultMetaXdr) : null,
        },
      ],
      skipDuplicates: true,
    });
  }

  if (tx.status === "SUCCESS" && sourceAccount) {
    const contract = decodeContractCreation(tx.envelopeXdr, tx.resultMetaXdr, sourceAccount);
    if (contract) {
      await db.contract.createMany({
        data: [
          {
            contractId: contract.contractId,
            creator: contract.creator,
            deploymentLedger: tx.ledger,
            deploymentTxHash: tx.txHash,
            createdAt,
          },
        ],
        skipDuplicates: true,
      });
    }
  }

  const changes = extractStorageChanges(tx.resultMetaXdr);
  if (changes.length > 0) {
    await db.storageChange.createMany({
      skipDuplicates: true,
      data: changes.map((c) => ({
        contractId: c.contractId,
        durability: c.durability,
        keyDisplay: c.keyDisplay,
        valueDisplay: c.valueDisplay,
        changeType: c.changeType,
        ledger: tx.ledger,
        txHash: tx.txHash,
        createdAt,
      })),
    });
  }

  const events = extractEvents(tx.resultMetaXdr, tx.txHash);
  if (events.length > 0) {
    await db.contractEventRecord.createMany({
      skipDuplicates: true,
      data: events.map((e) => ({
        eventId: e.eventId,
        contractId: e.contractId,
        type: e.type,
        topic: e.topic,
        value: e.value,
        txHash: tx.txHash,
        ledger: tx.ledger,
        createdAt,
      })),
    });
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/** Where a page leaves the cursor, plus any ledger range the page skipped without indexing. */
export interface PageProgress {
  lastLedger: number;
  paginationCursor: string | null;
  gap?: { fromLedger: number; toLedger: number; reason: string };
}

/** Fetch one transaction page from the persisted ledger and RPC pagination cursor. Writes nothing. */
async function fetchPage(
  cursor: number,
  paginationCursor: string | null,
  latestLedger: number
): Promise<{ transactions: rpc.Api.TransactionInfo[]; progress: PageProgress }> {
  let res;
  try {
    res = paginationCursor
      ? await server.getTransactions({ pagination: { limit: PAGE_LIMIT, cursor: paginationCursor } })
      : await server.getTransactions({ startLedger: cursor + 1, pagination: { limit: PAGE_LIMIT } });
  } catch (err) {
    const message = errorMessage(err);

    // Public RPC is typically a load-balanced pool — a node can briefly lag
    // behind the one that answered our getLatestLedger() call, making it
    // report our very next ledger as "in the future". Transient: don't
    // advance the cursor, just retry on the next poll.
    const oldestMatch = message.match(/oldest ledger:\s*(\d+)/i);
    const latestMatch = message.match(/latest ledger:\s*(\d+)/i);
    if (oldestMatch && Number(oldestMatch[1]) > cursor + 1) {
      console.warn(
        `[indexer] ledger ${cursor + 1} is before the RPC node's retention window (oldest: ${oldestMatch[1]}) — ` +
          `skipping ahead to ${latestLedger}. Some history in the gap was missed.`
      );
      return {
        transactions: [],
        progress: {
          lastLedger: latestLedger,
          paginationCursor: null,
          gap: {
            fromLedger: cursor + 1,
            toLedger: latestLedger,
            reason: `RPC retention: the node's oldest ledger is ${oldestMatch[1]}`,
          },
        },
      };
    }
    if (latestMatch && Number(latestMatch[1]) < cursor + 1) {
      return { transactions: [], progress: { lastLedger: cursor, paginationCursor } };
    }
    throw err;
  }

  if (res.transactions.length === 0) {
    return { transactions: [], progress: { lastLedger: latestLedger, paginationCursor: null } };
  }
  if (res.transactions.length === PAGE_LIMIT && (!res.cursor || res.cursor === paginationCursor)) {
    throw new Error("RPC returned a full page without advancing its transaction cursor");
  }
  return {
    transactions: res.transactions,
    progress: {
      lastLedger: Math.max(cursor, ...res.transactions.map((t) => t.ledger)),
      paginationCursor: res.transactions.length === PAGE_LIMIT ? res.cursor : null,
    },
  };
}

/**
 * Apply one page, its gap record, and its cursor in a single transaction, so the page
 * lands fully or not at all. A failure leaves no new rows and the old cursor in place.
 */
export async function commitPage(
  transactions: rpc.Api.TransactionInfo[],
  progress: PageProgress,
  client: Pick<typeof prisma, "$transaction"> = prisma
): Promise<void> {
  await client.$transaction(
    async (db) => {
      for (const tx of transactions) {
        await processTransaction(tx, db);
      }
      if (progress.gap) {
        await db.indexerGap.create({ data: progress.gap });
      }
      await setCursor(progress.lastLedger, progress.paginationCursor, db);
    },
    { timeout: 30_000 }
  );
}

async function main(): Promise<void> {
  const network = await server.getHealth();
  const existing = await findCursor();
  if (existing && process.env.INDEXER_START_LEDGER) {
    console.warn(
      `[indexer] INDEXER_START_LEDGER is ignored: the cursor already exists at ledger ${existing.lastLedger}`
    );
  }
  const initialCursor =
    existing ?? (await seedCursor(seedLastLedger(process.env.INDEXER_START_LEDGER, network)));
  let cursor = initialCursor.lastLedger;
  let paginationCursor = initialCursor.paginationCursor;
  health.cursor = cursor;
  health.latestLedger = network.latestLedger;
  console.log(`[indexer] starting at ledger ${cursor} (network is at ${network.latestLedger})`);

  const healthServer = startHealthServer();
  process.once("SIGTERM", requestShutdown);
  process.once("SIGINT", requestShutdown);

  let consecutiveFailures = 0;
  while (!stopping) {
    let delayMs = 0;
    try {
      const latestNow = await server.getLatestLedger();
      health.latestLedger = latestNow.sequence;
      if (stopping) break;

      let caughtUp = true;
      if (cursor < latestNow.sequence || paginationCursor) {
        const page = await fetchPage(cursor, paginationCursor, latestNow.sequence);
        const { progress } = page;
        if (
          page.transactions.length > 0 ||
          progress.lastLedger !== cursor ||
          progress.paginationCursor !== paginationCursor
        ) {
          await commitPage(page.transactions, progress);
          cursor = progress.lastLedger;
          paginationCursor = progress.paginationCursor;
          health.cursor = cursor;
          console.log(`[indexer] processed through ledger ${cursor}`);
        }
        caughtUp = cursor >= latestNow.sequence && !paginationCursor;
      }
      consecutiveFailures = 0;
      health.lastPollFailed = false;
      delayMs = caughtUp ? POLL_INTERVAL_MS : 0;
    } catch (err) {
      consecutiveFailures++;
      health.lastPollFailed = true;
      delayMs = backoffDelay(consecutiveFailures);
      console.error(
        `[indexer] poll error (failure ${consecutiveFailures}), retrying in ${delayMs}ms:`,
        err
      );
    }
    if (!stopping) await sleep(delayMs);
  }

  console.log("[indexer] shutting down");
  await setCursor(cursor, paginationCursor);
  healthServer.close();
  await prisma.$disconnect();
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (err) => {
    console.error("[indexer] fatal error:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
