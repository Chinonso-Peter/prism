import { getLedger, isNotFound } from "@/lib/horizon";
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Ledger</h1>
      <p className="text-prism-muted font-mono text-sm mb-8">#{ledger.sequence}</p>

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
