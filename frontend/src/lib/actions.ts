"use server";

import { coerceArgInput, decodeAnyXdr, type XdrDecodeResult } from "./xdr";
import {
  lookupStorageEntry,
  parseStorageKeyInput,
  simulateInvocation,
  type StorageKeyKind,
  type SimulationResult,
} from "./soroban";
import type { ContractTypeDef, StorageEntry } from "@/types";

export async function lookupStorageKeyAction(
  contractId: string,
  kind: StorageKeyKind,
  rawKey: string,
  durability: "persistent" | "temporary"
): Promise<StorageEntry | { error: string }> {
  if (!rawKey.trim()) return { error: "Enter a key to look up." };
  try {
    const key = parseStorageKeyInput(rawKey.trim(), kind);
    const entry = await lookupStorageEntry(contractId, key, durability);
    return entry ?? { error: "No entry found — check the key type/durability, or it may not exist." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid key." };
  }
}

/**
 * Decode a pasted base64 XDR blob. Runs server-side so the stellar-sdk XDR
 * machinery stays out of the client bundle, matching how the rest of Prism's
 * decoding works.
 */
export async function decodeXdrAction(input: string): Promise<XdrDecodeResult | { error: string }> {
  if (!input.trim()) return { error: "Paste some base64 XDR to decode." };
  const result = decodeAnyXdr(input);
  return (
    result ?? {
      error:
        "Not valid XDR of a type Prism recognizes (transaction envelope/result/meta, ledger entry or key, contract spec entry, or ScVal).",
    }
  );
}

export async function simulateInvocationAction(
  contractId: string,
  functionName: string,
  args: { value: string; type: string }[],
  // The contract's own type definitions, forwarded from the page that already
  // parsed them rather than re-fetching the WASM on every simulation. They
  // only shape argument encoding for a read-only simulation, so the worst a
  // wrong one can do is produce a call the contract rejects.
  types: ContractTypeDef[] = []
): Promise<SimulationResult> {
  try {
    const scArgs = args.map((a) => coerceArgInput(a.value, a.type, types));
    return await simulateInvocation(contractId, functionName, scArgs);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Invalid arguments." };
  }
}
