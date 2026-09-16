import Link from "next/link";
import type { ContractEvent, ContractEventSpec } from "@/types";
import { shortHash, timeAgo } from "@/lib/format";
import { labelEventData, labelEventTopics, matchEventSpec } from "@/lib/event-spec";

interface Props {
  events: ContractEvent[];
  /** Event declarations from the contract's spec, when it has any. */
  specs?: ContractEventSpec[];
}

export default function EventLog({ events, specs = [] }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-prism-muted text-sm">
        No events emitted by this contract in the last ~24h (the RPC node&apos;s retention window).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((e) => {
        // A contract that declares its events lets us name this one and label
        // its topics; one that publishes loose tuples doesn't, so fall back to
        // the raw topic list rather than guessing at names.
        const spec = matchEventSpec(e.topic, specs);
        const labelled = spec ? labelEventTopics(e.topic, spec) : [];
        // Null when the payload doesn't match what the declaration promises —
        // better to show it raw than to attach the wrong name to a value.
        const data = spec ? labelEventData(e.value, spec) : null;

        return (
          <div key={e.id} className="rounded-lg border border-prism-border bg-prism-surface p-4">
            <div className="flex justify-between mb-2 gap-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {spec ? (
                  <span
                    className="text-xs bg-prism-green/20 text-prism-green px-2 py-0.5 rounded font-mono"
                    title={spec.doc}
                  >
                    {spec.name}
                  </span>
                ) : (
                  <span className="text-xs bg-prism-accent/20 text-prism-accent px-2 py-0.5 rounded font-mono">
                    {e.type}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href={`/tx/${e.txHash}`}
                  className="text-xs text-prism-muted hover:text-white transition font-mono"
                >
                  {shortHash(e.txHash, 4)}
                </Link>
                <span className="text-xs text-prism-muted">{timeAgo(e.timestamp)}</span>
              </div>
            </div>

            {spec ? (
              labelled.length > 0 && (
                <dl className="mb-1 space-y-0.5">
                  {labelled.map((field) => (
                    <div key={field.name} className="flex gap-2 text-xs">
                      <dt className="text-prism-muted shrink-0">
                        {field.name}
                        <span className="opacity-60"> ({field.type})</span>
                      </dt>
                      <dd className="font-mono text-white break-all">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              )
            ) : (
              e.topic.length > 0 && (
                <p className="text-xs text-prism-muted mb-1">
                  Topic: <span className="font-mono text-white">{e.topic.join(", ")}</span>
                </p>
              )
            )}

            {data ? (
              <dl className="space-y-0.5">
                {data.map((field) => (
                  <div key={field.name} className="flex gap-2 text-xs">
                    <dt className="text-prism-muted shrink-0">
                      {field.name}
                      <span className="opacity-60"> ({field.type})</span>
                    </dt>
                    <dd className="font-mono text-white break-all">{field.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs font-mono text-prism-muted break-all">{e.value}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
