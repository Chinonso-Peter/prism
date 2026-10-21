import { getLedger, isNotFound } from "@/lib/horizon";
import { formatDate, formatNumber } from "@/lib/format";
import { notFound } from "next/navigation";
import DetailRow from "@/components/DetailRow";

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
        <DetailRow label="Hash"           value={ledger.hash} mono />
        <DetailRow label="Closed At"      value={formatDate(ledger.closedAt)} />
        <DetailRow label="Transactions"   value={formatNumber(ledger.transactionCount)} />
        <DetailRow label="Successful Txs" value={formatNumber(ledger.successfulTransactionCount)} />
        <DetailRow label="Failed Txs"     value={formatNumber(ledger.failedTransactionCount)} />
        <DetailRow label="Operations"     value={formatNumber(ledger.operationCount)} />
        <DetailRow label="Base Fee"       value={`${ledger.baseFee} stroops`} />
      </div>
    </div>
  );
}
