import type { AccountRecord, LedgerRecord, TransactionRecord } from "@/types";
import { config } from "./config";

const BASE_URL = config.horizonUrl;

/**
 * A non-ok response from Horizon, carrying the status so callers can tell
 * "this record doesn't exist" apart from "Horizon didn't answer".
 */
export class HorizonError extends Error {
  constructor(
    readonly status: number,
    readonly path: string
  ) {
    super(`Horizon error ${status}: ${path}`);
    this.name = "HorizonError";
  }
}

/** True only when Horizon positively reported the record as missing. */
export function isNotFound(error: unknown): boolean {
  return error instanceof HorizonError && error.status === 404;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    next: { revalidate: 10 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new HorizonError(res.status, path);
  return res.json();
}

// Horizon's JSON as it actually arrives. Worth spelling out rather than
// reaching into `any`: Horizon returns several numeric fields as strings
// (anything that can exceed 2^53 — fees, balances, sequence numbers), and
// mapping those straight through produces values that lie about their own
// type. Only the fields Prism reads are modelled.

interface HorizonPage<T> {
  _embedded: { records: T[] };
}

interface HorizonLedger {
  sequence: number;
  hash: string;
  closed_at: string;
  operation_count: number;
  base_fee_in_stroops: number;
  successful_transaction_count: number;
  failed_transaction_count: number;
}

interface HorizonTransaction {
  hash: string;
  ledger: number;
  created_at: string;
  source_account: string;
  /** A string in Horizon's JSON — fees are unbounded. */
  fee_charged: string | number;
  operation_count: number;
  successful: boolean;
  memo?: string | null;
  envelope_xdr: string;
  result_xdr: string;
}

interface HorizonBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

interface HorizonAccount {
  account_id: string;
  /** A string in Horizon's JSON — sequence numbers are int64. */
  sequence: string;
  subentry_count: number;
  last_modified_ledger: number;
  thresholds: { low_threshold: number; med_threshold: number; high_threshold: number };
  flags: {
    auth_required: boolean;
    auth_revocable: boolean;
    auth_immutable: boolean;
    auth_clawback_enabled: boolean;
  };
  balances: HorizonBalance[];
  signers?: unknown[];
}

export async function getLatestLedger(): Promise<LedgerRecord> {
  const data = await get<HorizonPage<HorizonLedger>>("/ledgers?order=desc&limit=1");
  return mapLedger(data._embedded.records[0]);
}

export async function getLedger(sequence: number): Promise<LedgerRecord> {
  const data = await get<HorizonLedger>(`/ledgers/${sequence}`);
  return mapLedger(data);
}

export async function getTransaction(hash: string): Promise<TransactionRecord> {
  const data = await get<HorizonTransaction>(`/transactions/${hash}`);
  return mapTransaction(data);
}

export async function getRecentTransactions(limit = 20): Promise<TransactionRecord[]> {
  const data = await get<HorizonPage<HorizonTransaction>>(`/transactions?order=desc&limit=${limit}`);
  return data._embedded.records.map(mapTransaction);
}

export async function getAccount(id: string): Promise<AccountRecord> {
  const data = await get<HorizonAccount>(`/accounts/${id}`);
  return mapAccount(data);
}

export interface NetworkPulse {
  sequence: number;
  transactionsPerSecond: number;
  closeTimeSeconds: number;
  operationCount: number;
  baseFee: number;
}

/**
 * A snapshot of network activity derived from the two most recent ledgers.
 * transactionsPerSecond/closeTimeSeconds are single-sample estimates (real
 * numbers, not fabricated) — expect them to be noisy ledger-to-ledger.
 */
export async function getNetworkPulse(): Promise<NetworkPulse> {
  const data = await get<HorizonPage<HorizonLedger>>("/ledgers?order=desc&limit=2");
  const [latest, prev] = data._embedded.records;
  const closeTimeSeconds =
    (new Date(latest.closed_at).getTime() - new Date(prev.closed_at).getTime()) / 1000;
  const txCount = latest.successful_transaction_count + latest.failed_transaction_count;
  return {
    sequence: latest.sequence,
    transactionsPerSecond: closeTimeSeconds > 0 ? txCount / closeTimeSeconds : 0,
    closeTimeSeconds,
    operationCount: latest.operation_count,
    baseFee: latest.base_fee_in_stroops,
  };
}

/**
 * Horizon returns int64-capable fields as JSON strings. Prism formats fees as
 * numbers, and every fee is far below 2^53, so converting is safe here —
 * unlike balances, which can exceed it and stay strings all the way to the UI.
 */
function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function mapLedger(r: HorizonLedger): LedgerRecord {
  return {
    sequence: r.sequence,
    hash: r.hash,
    closedAt: r.closed_at,
    transactionCount: r.successful_transaction_count + r.failed_transaction_count,
    operationCount: r.operation_count,
    baseFee: r.base_fee_in_stroops,
    successfulTransactionCount: r.successful_transaction_count,
    failedTransactionCount: r.failed_transaction_count,
  };
}

function mapAccount(r: HorizonAccount): AccountRecord {
  return {
    id: r.account_id,
    sequence: r.sequence,
    subentryCount: r.subentry_count,
    lastModifiedLedger: r.last_modified_ledger,
    thresholds: {
      low: r.thresholds.low_threshold,
      med: r.thresholds.med_threshold,
      high: r.thresholds.high_threshold,
    },
    flags: {
      authRequired: r.flags.auth_required,
      authRevocable: r.flags.auth_revocable,
      authImmutable: r.flags.auth_immutable,
      authClawbackEnabled: r.flags.auth_clawback_enabled,
    },
    balances: r.balances.map((b) => ({
      assetType: b.asset_type,
      assetCode: b.asset_code,
      assetIssuer: b.asset_issuer,
      balance: b.balance,
    })),
    signerCount: r.signers?.length ?? 0,
  };
}

function mapTransaction(r: HorizonTransaction): TransactionRecord {
  return {
    hash: r.hash,
    ledger: r.ledger,
    createdAt: r.created_at,
    sourceAccount: r.source_account,
    fee: toNumber(r.fee_charged),
    operationCount: r.operation_count,
    successful: r.successful,
    memo: r.memo ?? undefined,
    envelopeXdr: r.envelope_xdr,
    resultXdr: r.result_xdr,
  };
}
