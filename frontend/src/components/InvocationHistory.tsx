import Link from "next/link";
import type { InvocationHistoryItem } from "@/types";
import { shortHash } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import RelativeTime from "@/components/RelativeTime";

interface Props {
  items: InvocationHistoryItem[];
  /** True when no indexer is configured, so the items come from recent RPC events. */
  derivedFromEvents: boolean;
}

export default function InvocationHistory({ items, derivedFromEvents }: Props) {
  const notice = derivedFromEvents && (
    <p className="text-xs text-prism-muted mb-3">
      No indexer is configured, so these invocations are derived from the contract&apos;s recent events on
      the RPC node. A contract that emits no events won&apos;t appear here, and history only reaches back as
      far as the node&apos;s retention window.
    </p>
  );

  if (items.length === 0) {
    return (
      <>
        {notice}
        <EmptyState>
          No recent invocations found. This contract may not emit events (invocation history is derived from
          them), or its recent activity may be outside the RPC node&apos;s retention window.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {notice}
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.txHash}
            href={`/tx/${item.txHash}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-prism-border bg-prism-surface p-3 hover:border-prism-accent transition text-sm"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`text-xs px-2 py-0.5 rounded font-mono shrink-0 ${
                  item.successful ? "bg-prism-green/20 text-prism-green" : "bg-prism-red/20 text-prism-red"
                }`}
              >
                {item.successful ? "ok" : "fail"}
              </span>
              <span className="font-mono text-prism-accent truncate">{item.functionName ?? "(unknown fn)"}</span>
              <span className="text-prism-muted font-mono text-xs truncate hidden sm:inline">
                {shortHash(item.txHash)}
              </span>
            </div>
            <span className="text-prism-muted text-xs shrink-0">
              <RelativeTime iso={item.timestamp} />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
