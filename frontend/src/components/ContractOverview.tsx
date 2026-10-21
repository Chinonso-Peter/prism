import type { ContractInfo, ContractWasmInfo } from "@/types";
import { formatNumber } from "@/lib/format";
import DetailRow from "@/components/DetailRow";
import ErrorState from "@/components/ErrorState";

interface Props { info: ContractInfo | null; wasm: ContractWasmInfo | null }

export default function ContractOverview({ info, wasm }: Props) {
  if (!info) {
    return (
      <ErrorState>
        Couldn&apos;t load this contract — double-check the ID, or the RPC endpoint may be unreachable.
      </ErrorState>
    );
  }

  return (
    <div className="rounded-xl border border-prism-border bg-prism-surface p-6 space-y-4">
      <DetailRow label="Executable" value={info.executable === "wasm" ? "WASM contract" : "Stellar Asset Contract"} />
      {info.wasmHash && <DetailRow label="WASM Hash" value={info.wasmHash} mono />}
      {wasm && <DetailRow label="WASM Size" value={`${formatNumber(wasm.size)} bytes`} />}
      {info.liveUntilLedgerSeq !== undefined && (
        <DetailRow label="Live Until Ledger" value={`#${formatNumber(info.liveUntilLedgerSeq)}`} />
      )}
      {info.lastModifiedLedgerSeq !== undefined && (
        <DetailRow label="Last Modified Ledger" value={`#${formatNumber(info.lastModifiedLedgerSeq)}`} />
      )}
      {info.creator && (
        <DetailRow label="Creator" value={info.creator} mono link={`/account/${info.creator}`} />
      )}
      {info.deploymentLedger !== undefined && (
        <DetailRow
          label="Deployment Ledger"
          value={`#${formatNumber(info.deploymentLedger)}`}
          link={`/ledger/${info.deploymentLedger}`}
        />
      )}

      {wasm && wasm.functions.length > 0 && (
        <div className="pt-2">
          <p className="text-prism-muted text-sm mb-2">Functions ({wasm.functions.length})</p>
          <div className="rounded-lg border border-prism-border overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {wasm.functions.map((fn) => (
                  <tr key={fn.name} className="border-b border-prism-border last:border-0">
                    <td className="px-3 py-2 font-mono text-prism-accent whitespace-nowrap align-top">{fn.name}</td>
                    <td className="px-3 py-2 font-mono text-prism-muted">
                      ({fn.inputs.map((i) => `${i.name}: ${i.type}`).join(", ")})
                      {fn.outputs.length > 0 && <> &rarr; {fn.outputs.join(", ")}</>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {wasm && wasm.events.length > 0 && (
        <div className="pt-2">
          <p className="text-prism-muted text-sm mb-2">Events ({wasm.events.length})</p>
          <div className="rounded-lg border border-prism-border overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {wasm.events.map((event) => {
                  const topics = [
                    ...event.prefixTopics.map((t) => `"${t}"`),
                    ...event.params
                      .filter((p) => p.location === "topic")
                      .map((p) => `${p.name}: ${p.type}`),
                  ];
                  const data = event.params
                    .filter((p) => p.location === "data")
                    .map((p) => `${p.name}: ${p.type}`);

                  return (
                    <tr key={event.name} className="border-b border-prism-border last:border-0">
                      <td
                        className="px-3 py-2 font-mono text-prism-green whitespace-nowrap align-top"
                        title={event.doc}
                      >
                        {event.name}
                      </td>
                      <td className="px-3 py-2 font-mono text-prism-muted">
                        <span className="text-prism-strong">topics</span> [{topics.join(", ")}]
                        {data.length > 0 && (
                          <>
                            {" "}
                            <span className="text-prism-strong">data</span>
                            <span className="opacity-60"> ({event.dataFormat})</span> [
                            {data.join(", ")}]
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {wasm && wasm.types.length > 0 && (
        <div className="pt-2">
          <p className="text-prism-muted text-sm mb-2">Types ({wasm.types.length})</p>
          <div className="rounded-lg border border-prism-border overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {wasm.types.map((def) => (
                  <tr key={def.name} className="border-b border-prism-border last:border-0">
                    <td
                      className="px-3 py-2 font-mono text-prism-accent whitespace-nowrap align-top"
                      title={def.doc}
                    >
                      {def.name}
                      <span className="text-prism-muted opacity-60"> {def.kind}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-prism-muted">
                      {def.kind === "struct"
                        ? `{ ${def.fields.map((f) => `${f.name}: ${f.type}`).join(", ")} }`
                        : def.kind === "union"
                          ? def.cases
                              .map((c) => (c.types.length ? `${c.name}(${c.types.join(", ")})` : c.name))
                              .join(" | ")
                          : def.cases.map((c) => `${c.name} = ${c.value}`).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {wasm && wasm.functions.length === 0 && (
        <p className="text-prism-muted text-xs pt-2">
          No embedded ABI found for this contract — not every contract includes one.
        </p>
      )}
    </div>
  );
}
