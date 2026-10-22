import { StrKey, xdr, nativeToScVal } from "@stellar/stellar-sdk";
import type { ParsedTypeDef } from "./spec";

/** Split a generic's argument list on top-level commas, respecting nesting. */
function splitTypeArgs(inner: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of inner) {
    if (char === "<") depth++;
    if (char === ">") depth--;
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/** Match a generic spec type like "Vec<Symbol>" or "Map<Symbol, U32>". */
function parseGeneric(specType: string): { name: string; args: string[] } | null {
  const match = /^([A-Za-z]+)<(.+)>$/.exec(specType.trim());
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: splitTypeArgs(match[2]) };
}

/**
 * Parse a Vec or Map argument's JSON. A malformed value is reported with the
 * type and the shape it should take, not as the parser's bare SyntaxError.
 */
function parseJsonArg(raw: string, specType: string, shape: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${specType} expects ${shape}.`);
  }
}

/** Feed a JSON element back through the string-based coercion. */
function elementInput(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

interface IntegerBounds {
  min: bigint;
  max: bigint;
}

function unsignedBounds(bits: number): IntegerBounds {
  return { min: BigInt(0), max: BigInt(2) ** BigInt(bits) - BigInt(1) };
}

function signedBounds(bits: number): IntegerBounds {
  const half = BigInt(2) ** BigInt(bits - 1);
  return { min: -half, max: half - BigInt(1) };
}

/** The inclusive range each integer argument type can hold. */
const INTEGER_BOUNDS = {
  u32: unsignedBounds(32),
  i32: signedBounds(32),
  u64: unsignedBounds(64),
  i64: signedBounds(64),
  u128: unsignedBounds(128),
  i128: signedBounds(128),
};

/**
 * Read a whole-number argument and check it fits its type. Number and BigInt
 * accept more than that: "1.5" and "1e3" parse, and so does a value the type
 * can't hold, which the SDK then rejects or wraps.
 */
function parseInteger(raw: string, specType: string, bounds: IntegerBounds): bigint {
  const digits = raw.trim();
  const pattern = bounds.min < BigInt(0) ? /^-?\d+$/ : /^\d+$/;
  const value = pattern.test(digits) ? BigInt(digits) : null;
  if (value === null || value < bounds.min || value > bounds.max) {
    throw new Error(
      `"${digits}" is not a valid ${specType}. ${specType} takes a whole number from ${bounds.min} to ${bounds.max}.`
    );
  }
  return value;
}

/**
 * Coerce a plain-text form input into an ScVal for a given spec type name
 * (as produced by parseContractSpec, e.g. "U32", "Address", "Vec<Symbol>").
 *
 * Scalars convert exactly. Compound types are decomposed and their elements
 * coerced against the declared element types, because inferring from JSON
 * alone gets them wrong in ways the contract rejects: ["a"] as Vec<Symbol>
 * infers scvString, and [1] as Vec<i128> infers scvU64.
 *
 * A contract's own structs, unions and enums are coerced from its parsed type
 * definitions when those are supplied. Without them — or for a name the
 * contract doesn't define — the fallback is best-effort JSON inference: good
 * enough for a preview tool, not a substitute for a typed SDK binding.
 */
export function coerceArgInput(
  raw: string,
  specType: string,
  types: ParsedTypeDef[] = []
): xdr.ScVal {
  const t = specType.toLowerCase();
  if (t === "bool") return nativeToScVal(raw.trim().toLowerCase() === "true");
  if (t === "u32") return nativeToScVal(Number(parseInteger(raw, specType, INTEGER_BOUNDS.u32)), { type: "u32" });
  if (t === "i32") return nativeToScVal(Number(parseInteger(raw, specType, INTEGER_BOUNDS.i32)), { type: "i32" });
  if (t === "u64") return nativeToScVal(parseInteger(raw, specType, INTEGER_BOUNDS.u64), { type: "u64" });
  if (t === "i64") return nativeToScVal(parseInteger(raw, specType, INTEGER_BOUNDS.i64), { type: "i64" });
  if (t === "u128") return nativeToScVal(parseInteger(raw, specType, INTEGER_BOUNDS.u128), { type: "u128" });
  if (t === "i128") return nativeToScVal(parseInteger(raw, specType, INTEGER_BOUNDS.i128), { type: "i128" });
  if (t === "symbol") return nativeToScVal(raw, { type: "symbol" });
  if (t === "string") return nativeToScVal(raw, { type: "string" });
  if (t === "address") {
    // Checked here rather than left to the SDK, whose error for a mistyped
    // address says nothing about what went wrong.
    const address = raw.trim();
    if (
      !StrKey.isValidEd25519PublicKey(address) &&
      !StrKey.isValidMed25519PublicKey(address) &&
      !StrKey.isValidContract(address)
    ) {
      throw new Error(`"${address}" is not a valid account or contract address.`);
    }
    return nativeToScVal(address, { type: "address" });
  }
  if (t === "bytes") {
    // Node's hex decoder stops at the first bad character without an error, so
    // "zz" would quietly become an empty buffer. Check the digits first.
    const hex = raw.trim().replace(/^0x/, "");
    if (!/^([0-9a-fA-F]{2})*$/.test(hex)) {
      throw new Error(
        `"${raw.trim()}" is not valid hex. Bytes take an even number of hex digits, optionally prefixed with 0x.`
      );
    }
    return nativeToScVal(Buffer.from(hex, "hex"), { type: "bytes" });
  }
  if (t === "void") return xdr.ScVal.scvVoid();

  const generic = parseGeneric(specType);

  // An absent Option is void; anything else is the inner type.
  if (generic?.name === "option" && generic.args.length === 1) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "null") return xdr.ScVal.scvVoid();
    return coerceArgInput(raw, generic.args[0], types);
  }

  if (generic?.name === "vec" && generic.args.length === 1) {
    const parsed = parseJsonArg(raw, specType, 'a JSON array, e.g. ["a", "b"]');
    if (!Array.isArray(parsed)) {
      throw new Error(`${specType} expects a JSON array, e.g. ["a", "b"].`);
    }
    return xdr.ScVal.scvVec(
      parsed.map((item) => coerceArgInput(elementInput(item), generic.args[0], types))
    );
  }

  if (generic?.name === "map" && generic.args.length === 2) {
    const parsed = parseJsonArg(raw, specType, 'a JSON object, e.g. {"key": 1}');
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${specType} expects a JSON object, e.g. {"key": 1}.`);
    }
    const [keyType, valueType] = generic.args;
    // Soroban requires map keys in canonical order; handing nativeToScVal a
    // Map of already-typed ScVals lets the SDK do that sorting for us.
    const entries = new Map<xdr.ScVal, xdr.ScVal>();
    for (const [key, value] of Object.entries(parsed)) {
      entries.set(
        coerceArgInput(key, keyType, types),
        coerceArgInput(elementInput(value), valueType, types)
      );
    }
    return nativeToScVal(entries);
  }

  const udt = types.find((def) => def.name === specType.trim());
  if (udt) return coerceUdtInput(raw, udt, types);

  try {
    return nativeToScVal(JSON.parse(raw));
  } catch {
    return nativeToScVal(raw);
  }
}

/** Soroban encodes a Rust tuple struct as a Vec, not a Map keyed by "0", "1", ... */
function isTupleStruct(fields: { name: string }[]): boolean {
  return fields.length > 0 && fields.every((field) => /^\d+$/.test(field.name));
}

/**
 * Coerce an input against one of the contract's own type definitions.
 *
 * The encodings are Soroban's, not ours: a named struct is a map keyed by
 * field-name symbols, a tuple struct is a vec, a union variant is a vec led by
 * the variant's name symbol, and a u32 enum is just its discriminant.
 */
function coerceUdtInput(raw: string, def: ParsedTypeDef, types: ParsedTypeDef[]): xdr.ScVal {
  if (def.kind === "enum") {
    const trimmed = raw.trim();
    const byName = def.cases.find((c) => c.name === trimmed);
    if (byName) return nativeToScVal(byName.value, { type: "u32" });

    const asNumber = Number(trimmed);
    if (def.cases.some((c) => c.value === asNumber)) {
      return nativeToScVal(asNumber, { type: "u32" });
    }
    throw new Error(
      `${def.name} has no case ${trimmed || "(empty)"}. Expected one of: ${def.cases
        .map((c) => c.name)
        .join(", ")}.`
    );
  }

  if (def.kind === "error") {
    throw new Error(`${def.name} is an error type and can't be passed as an argument.`);
  }

  if (def.kind === "union") {
    // Either a bare variant name for a payload-free case, or {"Variant": [...]}.
    const trimmed = raw.trim();
    const bare = def.cases.find((c) => c.name === trimmed);
    if (bare) {
      if (bare.types.length > 0) {
        throw new Error(
          `${def.name}::${bare.name} takes ${bare.types.length} value(s). Pass {"${bare.name}": [...]}.`
        );
      }
      return xdr.ScVal.scvVec([nativeToScVal(bare.name, { type: "symbol" })]);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `${def.name} expects a variant name or {"Variant": [...]}. Cases: ${def.cases
          .map((c) => c.name)
          .join(", ")}.`
      );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${def.name} expects an object like {"Variant": [...]}.`);
    }

    const [[name, payload] = [], ...rest] = Object.entries(parsed as Record<string, unknown>);
    if (!name || rest.length > 0) {
      throw new Error(`${def.name} expects exactly one variant, e.g. {"Variant": [...]}.`);
    }
    const unionCase = def.cases.find((c) => c.name === name);
    if (!unionCase) {
      throw new Error(
        `${def.name} has no case ${name}. Cases: ${def.cases.map((c) => c.name).join(", ")}.`
      );
    }

    const values = Array.isArray(payload) ? payload : [payload];
    if (values.length !== unionCase.types.length) {
      throw new Error(
        `${def.name}::${name} takes ${unionCase.types.length} value(s), got ${values.length}.`
      );
    }
    return xdr.ScVal.scvVec([
      nativeToScVal(name, { type: "symbol" }),
      ...unionCase.types.map((type, i) => coerceArgInput(elementInput(values[i]), type, types)),
    ]);
  }

  // struct
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `${def.name} expects a JSON object with fields: ${def.fields
        .map((f) => `${f.name}: ${f.type}`)
        .join(", ")}.`
    );
  }

  if (isTupleStruct(def.fields)) {
    if (!Array.isArray(parsed) || parsed.length !== def.fields.length) {
      throw new Error(`${def.name} expects a JSON array of ${def.fields.length} value(s).`);
    }
    return xdr.ScVal.scvVec(
      def.fields.map((field, i) => coerceArgInput(elementInput(parsed[i]), field.type, types))
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `${def.name} expects a JSON object with fields: ${def.fields
        .map((f) => `${f.name}: ${f.type}`)
        .join(", ")}.`
    );
  }

  const payload = parsed as Record<string, unknown>;
  const missing = def.fields.filter((field) => !(field.name in payload)).map((f) => f.name);
  if (missing.length > 0) {
    throw new Error(`${def.name} is missing field(s): ${missing.join(", ")}.`);
  }

  // Handing nativeToScVal a Map of typed ScVals leaves the canonical key
  // ordering Soroban requires to the SDK.
  const entries = new Map<xdr.ScVal, xdr.ScVal>();
  for (const field of def.fields) {
    entries.set(
      nativeToScVal(field.name, { type: "symbol" }),
      coerceArgInput(elementInput(payload[field.name]), field.type, types)
    );
  }
  return nativeToScVal(entries);
}
