"use client";

import { useState, useTransition } from "react";
import { simulateInvocationAction } from "@/lib/actions";
import type { ContractFunctionSpec, ContractTypeDef } from "@/types";
import { describeContractError } from "@/lib/contract-error";
import type { SimulationResult } from "@/lib/soroban";
import { formatNumber } from "@/lib/format";

interface Props {
  contractId: string;
  functions: ContractFunctionSpec[];
  /** The contract's own types, used to name an error code it returns. */
  types?: ContractTypeDef[];
}

export default function InvokeTool({ contractId, functions, types = [] }: Props) {
  const [selected, setSelected] = useState(functions[0]?.name ?? "");
  const fn = functions.find((f) => f.name === selected);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSelect(name: string) {
    setSelected(name);
    setValues({});
    setResult(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fn) return;
    const args = fn.inputs.map((input) => ({ value: values[input.name] ?? "", type: input.type }));
    startTransition(async () => {
      const res = await simulateInvocationAction(contractId, fn.name, args);
      setResult(res);
    });
  }

  return (
    <div className="rounded-xl border border-prism-border bg-prism-surface p-4 space-y-3">
      <p className="text-xs text-prism-muted">
        Simulates the call against current ledger state — read-only, nothing is signed or submitted, no
        funds at risk.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <select
          value={selected}
          onChange={(e) => handleSelect(e.target.value)}
          className="w-full bg-prism-bg border border-prism-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-prism-accent"
        >
          {functions.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>

        {fn && fn.inputs.length > 0 && (
          <div className="space-y-2">
            {fn.inputs.map((input) => (
              <div key={input.name} className="flex items-center gap-2">
                <label className="text-xs font-mono text-prism-muted w-32 shrink-0 truncate">
                  {input.name}: {input.type}
                </label>
                <input
                  value={values[input.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [input.name]: e.target.value }))}
                  className="flex-1 bg-prism-bg border border-prism-border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-prism-accent"
                  placeholder={input.type}
                />
              </div>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={pending || !fn}
          className="bg-prism-accent text-white px-4 py-2 rounded-lg text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {pending ? "Simulating…" : "Simulate call"}
        </button>
      </form>

      {result && (
        <div className="text-xs font-mono border-t border-prism-border pt-3">
          {result.success ? (
            <div className="space-y-1">
              <p className="text-prism-green">Simulation succeeded</p>
              {result.returnValue !== undefined && (
                <p className="break-all">
                  <span className="text-prism-muted">Return:</span> {result.returnValue}
                </p>
              )}
              {result.instructions !== undefined && (
                <p>
                  <span className="text-prism-muted">Instructions:</span> {formatNumber(result.instructions)}
                </p>
              )}
              {result.resourceFeeStroops && (
                <p>
                  <span className="text-prism-muted">Est. resource fee:</span> {result.resourceFeeStroops}{" "}
                  stroops
                </p>
              )}
            </div>
          ) : (
            <ErrorReport message={result.error ?? "Simulation failed."} types={types} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A failed simulation, with the contract's own name for the error code when
 * its ABI declares one — "Error(Contract, #3)" means nothing on its own.
 */
function ErrorReport({ message, types }: { message: string; types: ContractTypeDef[] }) {
  const named = describeContractError(message, types);

  return (
    <div className="space-y-1">
      {named && (
        <p className="text-prism-red font-medium">
          {named.name} <span className="opacity-70">(#{named.code})</span>
        </p>
      )}
      <p className="text-prism-red break-all opacity-80">{message}</p>
    </div>
  );
}
