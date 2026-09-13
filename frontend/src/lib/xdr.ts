// XDR / ScVal decoding utilities for Prism, built on @stellar/stellar-sdk.
import { Address, StrKey, xdr, scValToNative, nativeToScVal } from "@stellar/stellar-sdk";
import { XdrReader } from "@stellar/js-xdr";
import type { ResourceUsage, SorobanInvocation } from "@/types";

/**
 * Coerce a plain-text form input into an ScVal for a given spec type name
 * (as produced by parseContractSpec, e.g. "U32", "Address", "Vec<Symbol>").
 * Scalar types get direct, exact conversions; compound/UDT types fall back
 * to best-effort JSON parsing — good enough for a preview tool, not a
 * substitute for a typed SDK binding.
 */
export function coerceArgInput(raw: string, specType: string): xdr.ScVal {
  const t = specType.toLowerCase();
  if (t === "bool") return nativeToScVal(raw.trim().toLowerCase() === "true");
  if (t === "u32") return nativeToScVal(Number(raw), { type: "u32" });
  if (t === "i32") return nativeToScVal(Number(raw), { type: "i32" });
  if (t === "u64") return nativeToScVal(BigInt(raw), { type: "u64" });
  if (t === "i64") return nativeToScVal(BigInt(raw), { type: "i64" });
  if (t === "u128") return nativeToScVal(BigInt(raw), { type: "u128" });
  if (t === "i128") return nativeToScVal(BigInt(raw), { type: "i128" });
  if (t === "symbol") return nativeToScVal(raw, { type: "symbol" });
  if (t === "string") return nativeToScVal(raw, { type: "string" });
  if (t === "address") return nativeToScVal(raw, { type: "address" });
  if (t === "bytes") return nativeToScVal(Buffer.from(raw.replace(/^0x/, ""), "hex"), { type: "bytes" });
  try {
    return nativeToScVal(JSON.parse(raw));
  } catch {
    return nativeToScVal(raw);
  }
}

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

/** Decode an XDR ScVal into a JSON-safe native JS value (bigints/bytes normalized to strings). */
export function decodeScVal(val: xdr.ScVal): unknown {
  try {
    return toDisplaySafe(scValToNative(val));
  } catch {
    return undefined;
  }
}

/** Decode an XDR ScVal to a compact, human-readable string for display. */
export function scValToDisplay(val: xdr.ScVal): string {
  if (val.switch().name === "scvVoid") return "void";
  const decoded = decodeScVal(val);
  if (decoded === undefined) return "(unrepresentable value)";
  return typeof decoded === "string" ? decoded : JSON.stringify(decoded);
}

/** Decode a base64-encoded ScVal XDR string to a display string. Falls back to the raw base64 on failure. */
export function decodeXdr(xdrBase64: string): string {
  try {
    return scValToDisplay(xdr.ScVal.fromXDR(xdrBase64, "base64"));
  } catch {
    return xdrBase64;
  }
}

/** Decode a base64-encoded ScVal XDR string to a native JS value. */
export function decodeScValXdr(xdrBase64: string): unknown {
  try {
    return decodeScVal(xdr.ScVal.fromXDR(xdrBase64, "base64"));
  } catch {
    return undefined;
  }
}

export interface ParsedFunctionSpec {
  name: string;
  inputs: { name: string; type: string }[];
  outputs: string[];
}

/** One field of a declared event, and whether it rides in the topic list or the data payload. */
export interface EventParamSpec {
  name: string;
  type: string;
  location: "topic" | "data";
}

export interface ParsedEventSpec {
  /** The Rust type name, e.g. "NoteWritten". */
  name: string;
  /** Fixed leading topics every instance of this event carries, e.g. ["note_written"]. */
  prefixTopics: string[];
  params: EventParamSpec[];
  dataFormat: "map" | "vec" | "single-value";
  doc?: string;
}

/**
 * Read every spec entry out of a contract's "contractspecv0" custom section.
 * Returns [] when the section is missing or unparsable — not every contract
 * embeds one (e.g. ones built without the spec-emitting macros).
 */
function readSpecEntries(wasm: Buffer): xdr.ScSpecEntry[] {
  try {
    const mod = new WebAssembly.Module(new Uint8Array(wasm));
    const sections = WebAssembly.Module.customSections(mod, "contractspecv0");
    if (sections.length === 0) return [];

    const entries: xdr.ScSpecEntry[] = [];
    for (const section of sections) {
      const reader = new XdrReader(Buffer.from(section));
      while (!reader.eof) {
        // stellar-sdk's generated .d.ts types read() as taking a Buffer, but
        // at runtime it reads from a stateful js-xdr cursor (XdrReader) — the
        // declaration is stale relative to the implementation.
        entries.push(xdr.ScSpecEntry.read(reader as unknown as Buffer));
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Parse the functions a contract exposes from its embedded spec (ABI).
 * Returns [] when the contract embeds no spec.
 */
export function parseContractSpec(wasm: Buffer): ParsedFunctionSpec[] {
  try {
    return readSpecEntries(wasm)
      .filter((e) => e.switch().name === "scSpecEntryFunctionV0")
      .map((e) => {
        const fn = e.functionV0();
        return {
          name: fn.name().toString(),
          inputs: fn.inputs().map((input) => ({
            name: input.name().toString(),
            type: specTypeToString(input.type()),
          })),
          outputs: fn.outputs().map(specTypeToString),
        };
      });
  } catch {
    return [];
  }
}

const EVENT_DATA_FORMATS: Record<string, ParsedEventSpec["dataFormat"]> = {
  scSpecEventDataFormatMap: "map",
  scSpecEventDataFormatVec: "vec",
  scSpecEventDataFormatSingleValue: "single-value",
};

/**
 * Parse the events a contract declares in its spec.
 *
 * Contracts built with soroban-sdk 25's `#[contractevent]` macro publish their
 * event schemas alongside their functions, which is what lets an explorer name
 * an event and label its fields instead of showing an anonymous list of ScVals.
 * Contracts that publish events as loose tuples declare nothing, so this
 * legitimately returns [] for most contracts in the wild.
 */
export function parseContractEvents(wasm: Buffer): ParsedEventSpec[] {
  try {
    return readSpecEntries(wasm)
      .filter((e) => e.switch().name === "scSpecEntryEventV0")
      .map((e) => {
        const event = e.eventV0();
        const doc = event.doc().toString();
        return {
          name: event.name().toString(),
          prefixTopics: event.prefixTopics().map((t) => t.toString()),
          params: event.params().map((param) => ({
            name: param.name().toString(),
            type: specTypeToString(param.type()),
            location:
              param.location().name === "scSpecEventParamLocationTopicList"
                ? ("topic" as const)
                : ("data" as const),
          })),
          dataFormat: EVENT_DATA_FORMATS[event.dataFormat().name] ?? "map",
          doc: doc || undefined,
        };
      });
  } catch {
    return [];
  }
}

function unwrapTx(envelope: xdr.TransactionEnvelope) {
  return envelope.switch().name === "envelopeTypeTxFeeBump"
    ? envelope.feeBump().tx().innerTx().v1().tx()
    : envelope.v1().tx();
}

/** Decode a transaction envelope's InvokeHostFunction operation (function name + args), if any. */
export function decodeInvocation(envelope: xdr.TransactionEnvelope): SorobanInvocation | null {
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

/** Decode a transaction envelope's Soroban resource footprint (instructions, I/O bytes, resource fee), if any. */
export function getResourceUsage(envelope: xdr.TransactionEnvelope): ResourceUsage | null {
  try {
    const tx = unwrapTx(envelope);
    const ext = tx.ext();
    if (ext.switch() !== 1) return null;
    const data = ext.sorobanData();
    const resources = data.resources();
    return {
      instructions: resources.instructions(),
      readBytes: resources.diskReadBytes(),
      writeBytes: resources.writeBytes(),
      resourceFeeStroops: data.resourceFee().toString(),
    };
  } catch {
    return null;
  }
}

/**
 * XDR types the decoder will try when handed an unlabelled base64 blob, in the
 * order it tries them. ScVal sits last on purpose: it is by far the most
 * permissive type, so anything that also parses as a richer type should be
 * reported as that type instead.
 */
const CANDIDATE_XDR_TYPES = [
  "TransactionEnvelope",
  "TransactionResult",
  "TransactionMeta",
  "LedgerEntry",
  "LedgerKey",
  "ScSpecEntry",
  "ScVal",
] as const;

export type XdrTypeName = (typeof CANDIDATE_XDR_TYPES)[number];

export interface XdrField {
  label: string;
  value: string;
}

export interface XdrDecodeResult {
  type: XdrTypeName;
  fields: XdrField[];
}

/**
 * Recover a base64 blob from a URL query parameter.
 *
 * Query strings decode "+" as a space, and base64 is full of pluses. Links
 * Prism generates are percent-encoded and round-trip exactly, but a
 * hand-assembled URL won't be — and base64 has no legitimate spaces, so any
 * space in a query parameter was a plus.
 */
export function base64FromQueryParam(raw: string): string {
  return raw.replace(/ /g, "+");
}

/** Strip whitespace/newlines that survive a copy-paste out of a terminal or JSON blob. */
function normalizeBase64(input: string): string {
  return input.replace(/\s+/g, "");
}

/**
 * Identify which XDR type a base64 blob actually is.
 *
 * XDR is not self-describing, so "it parsed" is a weak signal — plenty of blobs
 * parse as several types, producing garbage for all but one. The round-trip
 * check (decode, re-encode, compare bytes) is what makes this trustworthy: a
 * type that consumed every byte and reproduces the input exactly is a real
 * match, not a prefix that happened to parse.
 */
export function identifyXdr(input: string): XdrTypeName | null {
  const base64 = normalizeBase64(input);
  if (!base64) return null;

  for (const name of CANDIDATE_XDR_TYPES) {
    try {
      const type = xdr[name] as unknown as {
        fromXDR(data: string, format: "base64"): { toXDR(format: "base64"): string };
      };
      if (type.fromXDR(base64, "base64").toXDR("base64") === base64) return name;
    } catch {
      // Not this type — keep going.
    }
  }
  return null;
}

function muxedAccountToAddress(account: xdr.MuxedAccount): string {
  try {
    if (account.switch().name === "keyTypeEd25519") {
      return StrKey.encodeEd25519PublicKey(account.ed25519());
    }
    const muxed = account.med25519();
    return `${StrKey.encodeEd25519PublicKey(muxed.ed25519())} (muxed id ${muxed.id().toString()})`;
  } catch {
    return "(unrepresentable account)";
  }
}

function memoToDisplay(memo: xdr.Memo): string {
  const kind = memo.switch().name.replace(/^memo/, "").toLowerCase();
  try {
    switch (kind) {
      case "none":
        return "none";
      case "text":
        return `text: ${memo.text().toString()}`;
      case "id":
        return `id: ${memo.id().toString()}`;
      case "hash":
        return `hash: ${memo.hash().toString("hex")}`;
      case "return":
        return `return: ${memo.retHash().toString("hex")}`;
      default:
        return kind;
    }
  } catch {
    return kind;
  }
}

function transactionEnvelopeFields(envelope: xdr.TransactionEnvelope): XdrField[] {
  const fields: XdrField[] = [{ label: "Envelope type", value: envelope.switch().name }];

  const tx = unwrapTx(envelope);
  fields.push(
    { label: "Source account", value: muxedAccountToAddress(tx.sourceAccount()) },
    { label: "Fee", value: `${tx.fee()} stroops` },
    { label: "Sequence", value: tx.seqNum().toString() },
    { label: "Memo", value: memoToDisplay(tx.memo()) },
    {
      label: "Operations",
      value: tx
        .operations()
        .map((op) => op.body().switch().name)
        .join(", "),
    }
  );

  const invocation = decodeInvocation(envelope);
  if (invocation) {
    fields.push(
      { label: "Contract", value: invocation.contractId },
      { label: "Function", value: invocation.functionName },
      { label: "Arguments", value: invocation.args.length ? invocation.args.join(", ") : "(none)" }
    );
  }

  const resources = getResourceUsage(envelope);
  if (resources) {
    fields.push(
      { label: "Instructions", value: resources.instructions.toLocaleString() },
      { label: "Read / write bytes", value: `${resources.readBytes} / ${resources.writeBytes}` },
      { label: "Resource fee", value: `${resources.resourceFeeStroops} stroops` }
    );
  }

  return fields;
}

function transactionResultFields(result: xdr.TransactionResult): XdrField[] {
  const fields: XdrField[] = [
    { label: "Fee charged", value: `${result.feeCharged().toString()} stroops` },
    { label: "Result", value: result.result().switch().name },
  ];

  try {
    const opResults = result.result().results();
    if (opResults?.length) {
      fields.push({
        label: "Operation results",
        value: opResults.map((op) => op.switch().name).join(", "),
      });
    }
  } catch {
    // Result codes like txBadSeq carry no per-operation results.
  }

  return fields;
}

function transactionMetaFields(meta: xdr.TransactionMeta): XdrField[] {
  const fields: XdrField[] = [{ label: "Meta version", value: `v${meta.switch()}` }];

  try {
    const soroban = meta.switch() === 3 ? meta.v3().sorobanMeta() : null;
    if (soroban) {
      fields.push({ label: "Events", value: String(soroban.events().length) });
      fields.push({ label: "Return value", value: scValToDisplay(soroban.returnValue()) });
    }
  } catch {
    // Non-Soroban transactions carry no Soroban meta.
  }

  return fields;
}

function ledgerKeyFields(key: xdr.LedgerKey): XdrField[] {
  const kind = key.switch().name;
  const fields: XdrField[] = [{ label: "Key type", value: kind }];

  try {
    if (kind === "contractData") {
      const data = key.contractData();
      fields.push(
        { label: "Contract", value: Address.fromScAddress(data.contract()).toString() },
        { label: "Durability", value: data.durability().name },
        { label: "Storage key", value: scValToDisplay(data.key()) }
      );
    } else if (kind === "contractCode") {
      fields.push({ label: "WASM hash", value: key.contractCode().hash().toString("hex") });
    } else if (kind === "account") {
      fields.push({
        label: "Account",
        value: StrKey.encodeEd25519PublicKey(key.account().accountId().ed25519()),
      });
    }
  } catch {
    // Fall through to just the key type.
  }

  return fields;
}

function ledgerEntryFields(entry: xdr.LedgerEntry): XdrField[] {
  return [
    { label: "Entry type", value: entry.data().switch().name },
    { label: "Last modified ledger", value: String(entry.lastModifiedLedgerSeq()) },
  ];
}

function specEntryFields(entry: xdr.ScSpecEntry): XdrField[] {
  const kind = entry.switch().name;
  const fields: XdrField[] = [{ label: "Spec entry", value: kind }];
  if (kind === "scSpecEntryFunctionV0") {
    const fn = entry.functionV0();
    fields.push(
      { label: "Function", value: fn.name().toString() },
      {
        label: "Inputs",
        value:
          fn
            .inputs()
            .map((input) => `${input.name().toString()}: ${specTypeToString(input.type())}`)
            .join(", ") || "(none)",
      },
      { label: "Outputs", value: fn.outputs().map(specTypeToString).join(", ") || "(none)" }
    );
  }
  return fields;
}

function scValFields(value: xdr.ScVal): XdrField[] {
  const decoded = decodeScVal(value);
  return [
    { label: "ScVal type", value: value.switch().name },
    {
      label: "Value",
      value: decoded === undefined ? "(unrepresentable value)" : JSON.stringify(decoded, null, 2),
    },
  ];
}

/**
 * Decode an arbitrary base64 XDR blob into a labelled, human-readable summary.
 * Returns null when the input isn't valid XDR of any type Prism understands.
 *
 * This is deliberately a summary of the fields that matter when debugging a
 * Soroban transaction, not an exhaustive dump of every XDR field.
 */
export function decodeAnyXdr(input: string): XdrDecodeResult | null {
  const type = identifyXdr(input);
  if (!type) return null;

  const base64 = normalizeBase64(input);
  try {
    switch (type) {
      case "TransactionEnvelope":
        return { type, fields: transactionEnvelopeFields(xdr.TransactionEnvelope.fromXDR(base64, "base64")) };
      case "TransactionResult":
        return { type, fields: transactionResultFields(xdr.TransactionResult.fromXDR(base64, "base64")) };
      case "TransactionMeta":
        return { type, fields: transactionMetaFields(xdr.TransactionMeta.fromXDR(base64, "base64")) };
      case "LedgerEntry":
        return { type, fields: ledgerEntryFields(xdr.LedgerEntry.fromXDR(base64, "base64")) };
      case "LedgerKey":
        return { type, fields: ledgerKeyFields(xdr.LedgerKey.fromXDR(base64, "base64")) };
      case "ScSpecEntry":
        return { type, fields: specEntryFields(xdr.ScSpecEntry.fromXDR(base64, "base64")) };
      case "ScVal":
        return { type, fields: scValFields(xdr.ScVal.fromXDR(base64, "base64")) };
    }
  } catch {
    // The type round-tripped but a field accessor didn't behave as expected —
    // report the type we're confident about rather than failing outright.
    return { type, fields: [] };
  }
}

function specTypeToString(type: xdr.ScSpecTypeDef): string {
  const kind = type.switch().name;
  switch (kind) {
    case "scSpecTypeVec":
      return `Vec<${specTypeToString(type.vec().elementType())}>`;
    case "scSpecTypeMap":
      return `Map<${specTypeToString(type.map().keyType())}, ${specTypeToString(type.map().valueType())}>`;
    case "scSpecTypeOption":
      return `Option<${specTypeToString(type.option().valueType())}>`;
    case "scSpecTypeResult":
      return `Result<${specTypeToString(type.result().okType())}>`;
    case "scSpecTypeUdt":
      return type.udt().name().toString();
    default:
      return kind.replace(/^scSpecType/, "");
  }
}
