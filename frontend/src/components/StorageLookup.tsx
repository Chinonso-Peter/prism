"use client";

import { useState, useTransition } from "react";
import { lookupStorageKeyAction } from "@/lib/actions";
import type { StorageEntry } from "@/types";
import type { StorageKeyKind } from "@/lib/soroban";

interface Props { contractId: string }

export default function StorageLookup({ contractId }: Props) {
  const [kind, setKind] = useState<StorageKeyKind>("symbol");
  const [durability, setDurability] = useState<"persistent" | "temporary">("persistent");
  const [key, setKey] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<StorageEntry | { error: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function validateKey(value: string, keyKind: StorageKeyKind): string | null {
    if (!value.trim()) return null;
    
    switch (keyKind) {
      case "u32": {
        const num = Number(value);
        if (!/^\d+$/.test(value) || isNaN(num) || num < 0 || num > 4294967295) {
          return "Must be a valid u32 (0 to 4294967295)";
        }
        return null;
      }
      case "address": {
        if (!value.match(/^G[A-Z0-9]{55}$/)) {
          return "Must be a valid account address (G...)";
        }
        return null;
      }
      default:
        return null;
    }
  }

  function handleKeyChange(value: string) {
    setKey(value);
    const error = validateKey(value, kind);
    setValidationError(error);
  }

  function handleKindChange(newKind: StorageKeyKind) {
    setKind(newKind);
    const error = validateKey(key, newKind);
    setValidationError(error);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validationError) return;
    startTransition(async () => {
      const res = await lookupStorageKeyAction(contractId, kind, key, durability);
      setResult(res);
    });
  }

  return (
    <div className="rounded-xl border border-prism-border bg-prism-surface p-4 mt-4">
      <p className="text-sm text-prism-muted mb-3">
        Look up a specific persistent/temporary storage entry by key. Soroban RPC has no way to list all
        storage keys for a contract — you need to already know the key you&apos;re after.
      </p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-wrap gap-2 items-start">
          <select
            value={kind}
            onChange={(e) => handleKindChange(e.target.value as StorageKeyKind)}
            className="bg-prism-bg border border-prism-border rounded-lg px-2 py-2 text-xs font-mono outline-none focus:border-prism-accent"
          >
            <option value="symbol">Symbol</option>
            <option value="string">String</option>
            <option value="u32">U32</option>
            <option value="address">Address</option>
          </select>
          <select
            value={durability}
            onChange={(e) => setDurability(e.target.value as "persistent" | "temporary")}
            className="bg-prism-bg border border-prism-border rounded-lg px-2 py-2 text-xs font-mono outline-none focus:border-prism-accent"
          >
            <option value="persistent">Persistent</option>
            <option value="temporary">Temporary</option>
          </select>
          <div className="flex-1 min-w-[160px]">
            <input
              value={key}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="key"
              className="w-full bg-prism-bg border border-prism-border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-prism-accent"
            />
          </div>
          <button
            type="submit"
            disabled={pending || !!validationError}
            className="bg-prism-accent text-white px-4 py-2 rounded-lg text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {pending ? "Looking up…" : "Look up"}
          </button>
        </div>
        {validationError && <p className="text-xs text-prism-red">{validationError}</p>}
      </form>
      {result && (
        <div className="mt-3 text-xs font-mono">
          {"error" in result ? (
            <p className="text-prism-red">{result.error}</p>
          ) : (
            <div className="rounded-lg border border-prism-border p-3 space-y-1">
              <p>
                <span className="text-prism-muted">Key:</span> {result.key}
              </p>
              <p className="break-all">
                <span className="text-prism-muted">Value:</span> {result.value}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
