export interface LedgerRecord {
  sequence: number;
  hash: string;
  closedAt: string;
  transactionCount: number;
  operationCount: number;
  baseFee: number;
  successfulTransactionCount: number;
  failedTransactionCount: number;
}

export interface TransactionRecord {
  hash: string;
  ledger: number;
  createdAt: string;
  sourceAccount: string;
  fee: number;
  operationCount: number;
  successful: boolean;
  memo?: string;
  envelopeXdr: string;
}

export interface AccountBalance {
  assetType: string;
  assetCode?: string;
  assetIssuer?: string;
  balance: string;
}

export interface AccountRecord {
  id: string;
  sequence: string;
  subentryCount: number;
  lastModifiedLedger: number;
  thresholds: { low: number; med: number; high: number };
  flags: {
    authRequired: boolean;
    authRevocable: boolean;
    authImmutable: boolean;
    authClawbackEnabled: boolean;
  };
  balances: AccountBalance[];
  signerCount: number;
}

export interface ContractRecord {
  id: string;
  wasmHash: string;
  createdAt: string;
  creator: string;
  invocationCount?: number;
}

export interface ContractEvent {
  id: string;
  contractId: string;
  type: string;
  topic: string[];
  value: string;
  txHash: string;
  ledger: number;
  timestamp: string;
}

export interface StorageEntry {
  key: string;
  value: string;
  durability: "persistent" | "temporary" | "instance";
}

/** Info derivable from a contract's instance ledger entry alone (always fetchable from just a contract ID). */
export interface ContractInfo {
  executable: "wasm" | "stellar_asset";
  wasmHash?: string;
  liveUntilLedgerSeq?: number;
  lastModifiedLedgerSeq?: number;
  instanceStorage: StorageEntry[];
}

export interface ContractFunctionSpec {
  name: string;
  inputs: { name: string; type: string }[];
  outputs: string[];
}

/** An event the contract declares in its spec, as emitted by #[contractevent]. */
export interface ContractEventSpec {
  name: string;
  prefixTopics: string[];
  params: { name: string; type: string; location: "topic" | "data" }[];
  dataFormat: "map" | "vec" | "single-value";
  doc?: string;
}

/** A struct, union or enum the contract defines in its own spec. */
export type ContractTypeDef =
  | { kind: "struct"; name: string; doc?: string; fields: { name: string; type: string }[] }
  | { kind: "union"; name: string; doc?: string; cases: { name: string; types: string[] }[] }
  | { kind: "enum"; name: string; doc?: string; cases: { name: string; value: number }[] }
  | { kind: "error"; name: string; doc?: string; cases: { name: string; value: number }[] };

export interface ContractWasmInfo {
  size: number;
  functions: ContractFunctionSpec[];
  /** Empty for contracts that publish events as loose tuples rather than declaring them. */
  events: ContractEventSpec[];
  /** The contract's own structs, unions and enums, named by its signatures. */
  types: ContractTypeDef[];
}

/** A Soroban invocation decoded from a transaction's InvokeHostFunction operation. */
export interface SorobanInvocation {
  contractId: string;
  functionName: string;
  args: string[];
}

export interface ResourceUsage {
  instructions: number;
  readBytes: number;
  writeBytes: number;
  resourceFeeStroops: string;
}

/** One entry in a contract's recent activity, derived from its emitted events
 *  (bounded by the RPC node's retention window — not full history). */
export interface InvocationHistoryItem {
  txHash: string;
  ledger: number;
  timestamp: string;
  functionName?: string;
  args?: string[];
  successful: boolean;
}

export type Network = "testnet" | "mainnet";
