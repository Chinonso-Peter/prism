interface Endpoint {
  method: "GET" | "POST";
  path: string;
  description: string;
  params?: string;
  body?: string;
  example: string;
  notes?: string;
}

const endpoints: Endpoint[] = [
  {
    method: "GET",
    path: "/api/contract/:id",
    description: "Executable type, WASM hash, and instance storage for a contract.",
    example: "/api/contract/CDPUJYCTPGPEGS6MBXYLEWTYSGCPVKUHCURLF2ORT3RAVL5TF5JKIAI5",
  },
  {
    method: "GET",
    path: "/api/contract/:id/wasm",
    description:
      "WASM bytecode size and a best-effort parsed ABI: function names, args and return types, any events the contract declares (name, topics, data fields), and its own type definitions (structs, unions, enums).",
    example: "/api/contract/CDPUJYCTPGPEGS6MBXYLEWTYSGCPVKUHCURLF2ORT3RAVL5TF5JKIAI5/wasm",
    notes: "404s if the contract has no WASM (e.g. a Stellar Asset Contract).",
  },
  {
    method: "GET",
    path: "/api/contract/:id/events",
    description: "Events emitted by the contract.",
    params: "limit (default 50)",
    example: "/api/contract/CDPUJYCTPGPEGS6MBXYLEWTYSGCPVKUHCURLF2ORT3RAVL5TF5JKIAI5/events?limit=10",
    notes:
      "Full history since the indexer started, when one is configured (see indexer/). Otherwise bounded by the RPC node's retention window (~24h on public nodes).",
  },
  {
    method: "GET",
    path: "/api/contract/:id/invocations",
    description: "Invocation history for the contract.",
    params: "limit (default 20)",
    example: "/api/contract/CDPUJYCTPGPEGS6MBXYLEWTYSGCPVKUHCURLF2ORT3RAVL5TF5JKIAI5/invocations",
    notes:
      "Full history since the indexer started, when one is configured. Otherwise derived from recent events and bounded by the same RPC retention window — contracts that never emit events won't show up.",
  },
  {
    method: "GET",
    path: "/api/contract/:id/storage/full",
    description: "Every storage key observed for the contract, at its latest known value.",
    example: "/api/contract/CDPUJYCTPGPEGS6MBXYLEWTYSGCPVKUHCURLF2ORT3RAVL5TF5JKIAI5/storage/full",
    notes:
      "Requires the indexer (returns 501 without one) — this is the one thing plain RPC access genuinely cannot do (no method exists to list a contract's storage keys). Forward-only: reflects activity since the indexer started, not full chain history.",
  },
  {
    method: "GET",
    path: "/api/contract/:id/storage",
    description: "Look up one persistent/temporary storage entry by key.",
    params: "key (required), kind: symbol|string|u32|address (required), durability: persistent|temporary (default persistent)",
    example: "/api/contract/:id/storage?key=Admin&kind=symbol&durability=persistent",
    notes:
      "Works against live chain state via RPC regardless of whether an indexer is configured — you have to already know the key. For enumeration without knowing keys in advance, see /storage/full.",
  },
  {
    method: "POST",
    path: "/api/contract/:id/simulate",
    description: "Simulate a function call against current ledger state (read-only preview).",
    body: '{ "functionName": "current_root", "args": [{ "value": "42", "type": "U32" }] }',
    example: "/api/contract/CDPUJYCTPGPEGS6MBXYLEWTYSGCPVKUHCURLF2ORT3RAVL5TF5JKIAI5/simulate",
    notes: "No signing, no submission, no funds at risk. Rate-limited more tightly than the read routes (10/min).",
  },
  {
    method: "GET",
    path: "/api/tx/:hash",
    description: "Transaction detail plus decoded Soroban invocation (function/args) and resource usage, if any.",
    example: "/api/tx/c4a99120ad6b2c66d4b705b76e334f60c2c99af3f70d8b03be02c9df7dfe2fa6",
  },
  {
    method: "GET",
    path: "/api/ledger/:seq",
    description: "Ledger detail by sequence number.",
    example: "/api/ledger/4064026",
  },
];

export default function DocsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">API</h1>
      <p className="text-prism-muted text-sm mb-8 max-w-2xl">
        Read-only JSON endpoints backing the explorer — the same data layer the UI uses. All GET routes are
        rate-limited to 30 requests/minute per client; <code className="font-mono">/simulate</code> to
        10/minute. No API key required.
      </p>

      <div className="space-y-6">
        {endpoints.map((ep) => (
          <div key={ep.method + ep.path} className="rounded-xl border border-prism-border bg-prism-surface p-5">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span
                className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                  ep.method === "GET" ? "bg-prism-accent/20 text-prism-accent" : "bg-prism-green/20 text-prism-green"
                }`}
              >
                {ep.method}
              </span>
              <span className="font-mono text-sm">{ep.path}</span>
            </div>
            <p className="text-sm text-prism-muted mb-3">{ep.description}</p>
            {ep.params && (
              <p className="text-xs font-mono text-prism-muted mb-1">
                <span className="text-white">params:</span> {ep.params}
              </p>
            )}
            {ep.body && (
              <p className="text-xs font-mono text-prism-muted mb-1 break-all">
                <span className="text-white">body:</span> {ep.body}
              </p>
            )}
            <p className="text-xs font-mono text-prism-muted break-all mt-2">
              <span className="text-white">example:</span> {ep.example}
            </p>
            {ep.notes && <p className="text-xs text-prism-muted mt-2 italic">{ep.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
