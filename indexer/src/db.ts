import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/** The shared client, or the client of an open transaction. */
export type Db = Prisma.TransactionClient;

export interface IndexerCursor {
  lastLedger: number;
  paginationCursor: string | null;
}

export async function findCursor(): Promise<IndexerCursor | null> {
  return prisma.indexerCursor.findUnique({ where: { id: 1 } });
}

/** Create the cursor on a fresh database; `lastLedger` is the last ledger already treated as processed. */
export async function seedCursor(lastLedger: number): Promise<IndexerCursor> {
  return prisma.indexerCursor.create({ data: { id: 1, lastLedger } });
}

export async function setCursor(
  ledger: number,
  paginationCursor: string | null,
  db: Db = prisma
): Promise<void> {
  await db.indexerCursor.upsert({
    where: { id: 1 },
    update: { lastLedger: ledger, paginationCursor },
    create: { id: 1, lastLedger: ledger, paginationCursor },
  });
}

export async function getBackfillCursor(fromLedger: number, toLedger: number) {
  const existing = await prisma.backfillCursor.findUnique({ where: { id: 1 } });
  if (existing && !existing.completed) {
    if (existing.fromLedger !== fromLedger || existing.toLedger !== toLedger) {
      throw new Error(
        `Backfill ${existing.fromLedger}-${existing.toLedger} is incomplete; resume that range before starting another.`
      );
    }
    return existing;
  }
  if (existing?.completed && existing.fromLedger === fromLedger && existing.toLedger === toLedger) {
    return existing;
  }
  return prisma.backfillCursor.upsert({
    where: { id: 1 },
    update: {
      fromLedger,
      toLedger,
      lastLedger: fromLedger - 1,
      paginationCursor: null,
      completed: false,
    },
    create: {
      id: 1,
      fromLedger,
      toLedger,
      lastLedger: fromLedger - 1,
      paginationCursor: null,
      completed: false,
    },
  });
}

export async function setBackfillCursor(
  fromLedger: number,
  toLedger: number,
  lastLedger: number,
  paginationCursor: string | null,
  completed: boolean
): Promise<void> {
  await prisma.backfillCursor.upsert({
    where: { id: 1 },
    update: { lastLedger, paginationCursor, completed },
    create: { id: 1, fromLedger, toLedger, lastLedger, paginationCursor, completed },
  });
}
