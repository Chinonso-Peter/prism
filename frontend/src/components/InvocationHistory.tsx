import Link from "next/link";
import type { InvocationHistoryItem } from "@/types";
import { shortHash, timeAgo } from "@/lib/format";
import EmptyState from "@/components/EmptyState";

interface Props { items: InvocationHistoryItem[] }

export default function InvocationHistory({ items }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState>
        No recent invocations found. This contract may not emit events (invocation history is derived from
        them), or its recent activity may be outside the RPC node&apos;s retention window.
      </EmptyState>
    );
  }

  return (
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
          <span className="text-prism-muted text-xs shrink-0">{timeAgo(item.timestamp)}</span>
        </Link>
      ))}
    </div>
  );
}
