import Link from "next/link";
import { getLatestLedger, getLedger, isNotFound } from "@/lib/horizon";
import { formatDate, formatNumber } from "@/lib/format";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props { params: { seq: string } }

export default async function LedgerPage({ params }: Props) {
  const seq = parseInt(params.seq, 10);
  if (isNaN(seq)) notFound();

  let ledger;
  try {
    ledger = await getLedger(seq);
  } catch (err) {
    if (isNotFound(err)) notFound();
    throw err;
  }

  // Without a latest ledger we can't tell whether this one is the newest, so
  // leave "next" out rather than link to a ledger that may not exist yet.
  const latest = await getLatestLedger().catch(() => null);
  const prevSeq = seq > 1 ? seq - 1 : null;
  const nextSeq = latest && seq < latest.sequence ? seq + 1 : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Ledger</h1>
      <p className="text-prism-muted font-mono text-sm mb-4">#{ledger.sequence}</p>

      <nav aria-label="Ledger navigation" className="flex justify-between text-sm mb-8">
        <span>
          {prevSeq !== null && (
            <Link href={`/ledger/${prevSeq}`} className="text-prism-accent hover:underline">
              &larr; Ledger #{prevSeq}
            </Link>
          )}
        </span>
        <span>
          {nextSeq !== null && (
            <Link href={`/ledger/${nextSeq}`} className="text-prism-accent hover:underline">
              Ledger #{nextSeq} &rarr;
            </Link>
          )}
        </span>
      </nav>

      <div className="rounded-xl border border-prism-border bg-prism-surface p-6 space-y-4">
        <Row label="Hash"           value={ledger.hash} mono />
        <Row label="Closed At"      value={formatDate(ledger.closedAt)} />
        <Row label="Transactions"   value={formatNumber(ledger.transactionCount)} />
        <Row label="Successful Txs" value={formatNumber(ledger.successfulTransactionCount)} />
        <Row label="Failed Txs"     value={formatNumber(ledger.failedTransactionCount)} />
        <Row label="Operations"     value={formatNumber(ledger.operationCount)} />
        <Row label="Base Fee"       value={`${ledger.baseFee} stroops`} />
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-prism-border pb-3 last:border-0 last:pb-0">
      <span className="text-prism-muted text-sm">{label}</span>
      <span className={`text-sm break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
