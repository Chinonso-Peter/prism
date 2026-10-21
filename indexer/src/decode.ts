import { Address, StrKey, xdr, scValToNative } from "@stellar/stellar-sdk";

function toDisplaySafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (Array.isArray(value)) return value.map(toDisplaySafe);
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([k, v]) => [String(toDisplaySafe(k)), toDisplaySafe(v)])
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toDisplaySafe(v)])
    );
  }
  return value;
}

/** Decode an ScVal to a compact display string. Mirrors frontend/src/lib/xdr.ts's scValToDisplay. */
export function scValToDisplay(val: xdr.ScVal): string {
  const switchName = val.switch().name;
  if (switchName === "scvVoid") return "void";
  if (switchName === "scvLedgerKeyContractInstance") return "__instance__";
  // scvContractInstance wraps an ScContractInstance struct (executable + storage
  // map), not plain data — scValToNative doesn't decode it, and JSON-stringifying
  // it directly dumps the internal js-xdr class. Callers that expect a contract
  // instance value should read it via .instance() instead of this function.
  if (switchName === "scvContractInstance") return "(contract instance)";
  try {
    const decoded = toDisplaySafe(scValToNative(val));
    return typeof decoded === "string" ? decoded : JSON.stringify(decoded);
  } catch {
    return "(unrepresentable value)";
  }
}

export interface DecodedInvocation {
  contractId: string;
  functionName: string;
  args: unknown;
}

function unwrapTx(envelope: xdr.TransactionEnvelope) {
  return envelope.switch().name === "envelopeTypeTxFeeBump"
    ? envelope.feeBump().tx().innerTx().v1().tx()
    : envelope.v1().tx();
}

export function decodeInvocation(envelope: xdr.TransactionEnvelope): DecodedInvocation | null {
  try {
    const tx = unwrapTx(envelope);
    for (const op of tx.operations()) {
      if (op.body().switch().name !== "invokeHostFunction") continue;
      const hostFn = op.body().invokeHostFunctionOp().hostFunction();
      if (hostFn.switch().name !== "hostFunctionTypeInvokeContract") continue;
      const invoke = hostFn.invokeContract();
      return {
        contractId: Address.fromScAddress(invoke.contractAddress()).toString(),
        functionName: invoke.functionName().toString(),
        args: invoke.args().map(scValToDisplay),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function extractInvocationReturnValue(meta: xdr.TransactionMeta): string | null {
  const returnValue = sorobanReturnValue(meta);
  return returnValue ? scValToDisplay(returnValue) : null;
}

export interface DecodedContractCreation {
  contractId: string;
  creator: string;
}

export function decodeContractCreation(
  envelope: xdr.TransactionEnvelope,
  meta: xdr.TransactionMeta,
  creator: string
): DecodedContractCreation | null {
  try {
    const tx = unwrapTx(envelope);
    const createsContract = tx.operations().some((op) => {
      if (op.body().switch().name !== "invokeHostFunction") return false;
      const hostFunction = op.body().invokeHostFunctionOp().hostFunction();
      const kind = hostFunction.switch().name;
      return kind === "hostFunctionTypeCreateContract" || kind === "hostFunctionTypeCreateContractV2";
    });
    if (!createsContract) return null;
    const returnValue = sorobanReturnValue(meta);
    if (!returnValue) return null;
    if (returnValue.switch().name !== "scvAddress") return null;
    return {
      contractId: Address.fromScAddress(returnValue.address()).toString(),
      creator,
    };
  } catch {
    return null;
  }
}

function sorobanReturnValue(meta: xdr.TransactionMeta): xdr.ScVal | null {
  try {
    if (meta.switch() === 3) return meta.v3().sorobanMeta()?.returnValue() ?? null;
    if (meta.switch() === 4) return meta.v4().sorobanMeta()?.returnValue() ?? null;
  } catch {
    return null;
  }
  return null;
}

export interface DecodedStorageChange {
  contractId: string;
  durability: "persistent" | "temporary" | "instance";
  keyDisplay: string;
  valueDisplay: string | null;
  changeType: "created" | "updated" | "removed" | "state";
}

/**
 * Extract every ContractData ledger-entry change from a transaction's
 * per-operation meta. Includes "state" rows (the entry's value immediately
 * before this operation) alongside created/updated/removed, giving a full
 * append-only change log rather than just latest-value snapshots.
 */
export function extractStorageChanges(meta: xdr.TransactionMeta): DecodedStorageChange[] {
  const switchValue = meta.switch();
  const v = switchValue === 4 ? meta.v4() : switchValue === 3 ? meta.v3() : null;
  if (!v) return [];

  const out: DecodedStorageChange[] = [];
  for (const opMeta of v.operations()) {
    for (const change of opMeta.changes()) {
      const kind = change.switch().name;
      if (kind === "ledgerEntryRemoved") {
        const key = change.removed();
        if (key.switch().name !== "contractData") continue;
        const cd = key.contractData();
        out.push({
          contractId: Address.fromScAddress(cd.contract()).toString(),
          durability: cd.durability().name as "persistent" | "temporary",
          keyDisplay: scValToDisplay(cd.key()),
          valueDisplay: null,
          changeType: "removed",
        });
        continue;
      }

      const entry =
        kind === "ledgerEntryCreated"
          ? change.created()
          : kind === "ledgerEntryUpdated"
            ? change.updated()
            : kind === "ledgerEntryState"
              ? change.state()
              : null;
      if (!entry) continue;

      const data = entry.data();
      if (data.switch().name !== "contractData") continue;
      const cd = data.contractData();
      const isInstanceKey = cd.key().switch().name === "scvLedgerKeyContractInstance";
      const changeType =
        kind === "ledgerEntryCreated" ? "created" : kind === "ledgerEntryUpdated" ? "updated" : "state";
      const contractId = Address.fromScAddress(cd.contract()).toString();

      if (isInstanceKey) {
        out.push(...expandInstanceEntry(contractId, cd.val(), changeType));
        continue;
      }

      out.push({
        contractId,
        durability: cd.durability().name as "persistent" | "temporary",
        keyDisplay: scValToDisplay(cd.key()),
        valueDisplay: scValToDisplay(cd.val()),
        changeType,
      });
    }
  }
  return out;
}

/**
 * The contract instance entry's value is an ScContractInstance struct
 * (executable + an instance-storage map), not plain data — unpack it into
 * one row for the WASM hash (tracks upgrades) plus one row per instance
 * storage entry, rather than dumping the struct as an opaque blob.
 */
function expandInstanceEntry(
  contractId: string,
  val: xdr.ScVal,
  changeType: DecodedStorageChange["changeType"]
): DecodedStorageChange[] {
  if (val.switch().name !== "scvContractInstance") return [];
  const instance = val.instance();
  const out: DecodedStorageChange[] = [];

  const executable = instance.executable();
  if (executable.switch().name === "contractExecutableWasm") {
    out.push({
      contractId,
      durability: "instance",
      keyDisplay: "__wasm_hash__",
      valueDisplay: executable.wasmHash().toString("hex"),
      changeType,
    });
  }

  for (const entry of instance.storage() ?? []) {
    out.push({
      contractId,
      durability: "instance",
      keyDisplay: scValToDisplay(entry.key()),
      valueDisplay: scValToDisplay(entry.val()),
      changeType,
    });
  }

  return out;
}

export interface DecodedEvent {
  eventId: string;
  contractId: string;
  type: string;
  topic: string[];
  value: string;
}

/**
 * Extract contract-type events (skips system/diagnostic) from a transaction's
 * per-operation meta. Only TransactionMetaV4's OperationMetaV2 carries
 * per-operation events — V3's OperationMeta doesn't have them at all, so
 * older-format transactions (rare on a current network) are skipped here;
 * they're still covered by extractStorageChanges/decodeInvocation.
 */
export function extractEvents(meta: xdr.TransactionMeta, txHash: string): DecodedEvent[] {
  if (meta.switch() !== 4) return [];
  const v = meta.v4();

  const out: DecodedEvent[] = [];
  v.operations().forEach((opMeta, opIndex) => {
    opMeta.events().forEach((event, eventIndex) => {
      if (event.type().name !== "contract") return;
      // The generated type says Hash (Opaque[]) but js-xdr represents fixed
      // opaque values as Buffer at runtime — same as elsewhere in this codebase.
      let contractIdBuf: Buffer | null;
      try {
        contractIdBuf = event.contractId() as unknown as Buffer | null;
      } catch {
        return;
      }
      if (!contractIdBuf) return;

      const body = event.body().v0();
      out.push({
        eventId: `${txHash}-${opIndex}-${eventIndex}`,
        contractId: StrKey.encodeContract(contractIdBuf),
        type: event.type().name,
        topic: body.topics().map(scValToDisplay),
        value: scValToDisplay(body.data()),
      });
    });
  });
  return out;
}
