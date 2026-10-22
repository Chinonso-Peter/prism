import { rpc, encodeMuxedAccountToAddress, type xdr } from "@stellar/stellar-sdk";
import { pathToFileURL } from "node:url";
import { prisma, getCursor, setCursor } from "./db.js";
import {
  decodeContractCreation,
  decodeInvocation,
  extractEvents,
  extractInvocationReturnValue,
  extractStorageChanges,
} from "./decode.js";

const RPC_URL = process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
export const PAGE_LIMIT = 50;

export const server = new rpc.Server(RPC_URL, { timeout: 10_000 });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export async function processTransaction(tx: rpc.Api.TransactionInfo): Promise<void> {
  const createdAt = new Date(tx.createdAt * 1000);
  const invocation = decodeInvocation(tx.envelopeXdr);
  const sourceAccount = sourceAccountOf(tx.envelopeXdr);

  if (invocation) {
    // skipDuplicates makes reprocessing a page after a crash-before-cursor-advance safe.
    await prisma.invocation.createMany({
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
      await prisma.contract.createMany({
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
    await prisma.storageChange.createMany({
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
    await prisma.contractEventRecord.createMany({
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

/** Process one transaction page starting from the persisted ledger and RPC pagination cursor. */
async function pollOnce(
  cursor: number,
  paginationCursor: string | null,
  latestLedger: number
): Promise<{ lastLedger: number; paginationCursor: string | null }> {
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
      return { lastLedger: latestLedger, paginationCursor: null };
    }
    if (latestMatch && Number(latestMatch[1]) < cursor + 1) {
      return { lastLedger: cursor, paginationCursor };
    }
    throw err;
  }

  for (const tx of res.transactions) {
    await processTransaction(tx);
  }

  if (res.transactions.length === 0) return { lastLedger: latestLedger, paginationCursor: null };
  if (res.transactions.length === PAGE_LIMIT && (!res.cursor || res.cursor === paginationCursor)) {
    throw new Error("RPC returned a full page without advancing its transaction cursor");
  }
  return {
    lastLedger: Math.max(cursor, ...res.transactions.map((t) => t.ledger)),
    paginationCursor: res.transactions.length === PAGE_LIMIT ? res.cursor : null,
  };
}

async function main(): Promise<void> {
  const latest = await server.getLatestLedger();
  const initialCursor = await getCursor(latest.sequence);
  let cursor = initialCursor.lastLedger;
  let paginationCursor = initialCursor.paginationCursor;
  console.log(`[indexer] starting at ledger ${cursor} (network is at ${latest.sequence})`);

  while (true) {
    let caughtUp = true;
    try {
      const latestNow = await server.getLatestLedger();
      if (cursor < latestNow.sequence || paginationCursor) {
        const progress = await pollOnce(cursor, paginationCursor, latestNow.sequence);
        if (progress.lastLedger !== cursor || progress.paginationCursor !== paginationCursor) {
          cursor = progress.lastLedger;
          paginationCursor = progress.paginationCursor;
          await setCursor(cursor, paginationCursor);
          console.log(`[indexer] processed through ledger ${cursor}`);
        }
        caughtUp = cursor >= latestNow.sequence && !paginationCursor;
      }
    } catch (err) {
      console.error("[indexer] poll error:", err);
    }
    if (caughtUp) await sleep(POLL_INTERVAL_MS);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (err) => {
    console.error("[indexer] fatal error:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
