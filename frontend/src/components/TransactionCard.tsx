import Link from "next/link";
import type { TransactionRecord } from "@/types";
import { shortHash, timeAgo, formatFee } from "@/lib/format";

interface Props { tx: TransactionRecord }

export default function TransactionCard({ tx }: Props) {
  return (
    <Link
      href={`/tx/${tx.hash}`}
      className="flex items-center justify-between p-4 rounded-lg border border-prism-border bg-prism-surface hover:border-prism-accent transition"
    >
      <div className="flex items-center gap-4">
        <span className={`text-xs font-semibold px-2 py-1 rounded ${tx.successful ? "bg-prism-green/20 text-prism-green" : "bg-prism-red/20 text-prism-red"}`}>
          {tx.successful ? "SUCCESS" : "FAILED"}
        </span>
        <span className="font-mono text-sm text-white">{shortHash(tx.hash)}</span>
      </div>
      <div className="flex items-center gap-6 text-sm text-prism-muted">
        <span>{tx.operationCount} op{tx.operationCount !== 1 ? "s" : ""}</span>
        <span>{formatFee(tx.fee)}</span>
        <span>{timeAgo(tx.createdAt)}</span>
      </div>
    </Link>
  );
}
