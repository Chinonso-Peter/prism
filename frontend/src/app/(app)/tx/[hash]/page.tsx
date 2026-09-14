import Link from "next/link";
import { xdr } from "@stellar/stellar-sdk";
import { getTransaction, isNotFound } from "@/lib/horizon";
import CopyButton from "@/components/CopyButton";
import { getInvocationReturnValue } from "@/lib/soroban";
import { decodeInvocation, getResourceUsage } from "@/lib/xdr";
import { formatDate, formatFee, stroopsToXlm, formatNumber } from "@/lib/format";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props { params: { hash: string } }

export default async function TxPage({ params }: Props) {
  let tx;
  try {
    tx = await getTransaction(params.hash);
  } catch (err) {
    if (isNotFound(err)) notFound();
    throw err;
  }

  const envelope = xdr.TransactionEnvelope.fromXDR(tx.envelopeXdr, "base64");
  const invocation = decodeInvocation(envelope);
  const resources = getResourceUsage(envelope);
  const returnValue = invocation ? await getInvocationReturnValue(tx.hash) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Transaction</h1>
      <div className="flex items-start gap-2 mb-8">
        <p className="text-prism-muted font-mono text-sm break-all">{params.hash}</p>
        <CopyButton value={params.hash} what="transaction hash" />
      </div>

      <div className="rounded-xl border border-prism-border bg-prism-surface p-6 space-y-4">
        <Row label="Status" value={tx.successful ? "✓ Success" : "✗ Failed"} />
        <Row label="Ledger" value={String(tx.ledger)} />
        <Row label="Timestamp" value={formatDate(tx.createdAt)} />
        <Row label="Source" value={tx.sourceAccount} mono />
        <Row label="Fee" value={`${formatFee(tx.fee)} (${stroopsToXlm(tx.fee)})`} />
        <Row label="Operations" value={String(tx.operationCount)} />
        {tx.memo && <Row label="Memo" value={tx.memo} />}
      </div>

      {invocation && (
        <div className="mt-6 rounded-xl border border-prism-border bg-prism-surface p-6 space-y-4">
          <h2 className="text-lg font-semibold mb-1">Soroban Invocation</h2>
          <Row label="Contract" value={invocation.contractId} mono link={`/contract/${invocation.contractId}`} />
          <Row label="Function" value={invocation.functionName} mono />
          {invocation.args.length > 0 && (
            <div className="border-b border-prism-border pb-3">
              <p className="text-prism-muted text-sm mb-2">Arguments</p>
              <div className="space-y-1">
                {invocation.args.map((a, i) => (
                  <p key={i} className="text-xs font-mono text-prism-muted break-all">
                    {a}
                  </p>
                ))}
              </div>
            </div>
          )}
          {returnValue !== null && <Row label="Return Value" value={returnValue} mono />}
          {resources && (
            <>
              <Row label="CPU Instructions" value={formatNumber(resources.instructions)} />
              <Row label="Read Bytes" value={formatNumber(resources.readBytes)} />
              <Row label="Write Bytes" value={formatNumber(resources.writeBytes)} />
              <Row label="Resource Fee" value={`${resources.resourceFeeStroops} stroops`} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: string }) {
  return (
    <div className="flex justify-between border-b border-prism-border pb-3 last:border-0 last:pb-0 gap-4">
      <span className="text-prism-muted text-sm shrink-0">{label}</span>
      {link ? (
        <Link
          href={link}
          className={`text-sm text-right break-all text-prism-accent hover:underline ${mono ? "font-mono" : ""}`}
        >
          {value}
        </Link>
      ) : (
        <span className={`text-sm text-right break-all ${mono ? "font-mono" : ""}`}>{value}</span>
      )}
    </div>
  );
}
