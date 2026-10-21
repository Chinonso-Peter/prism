import Link from "next/link";
import { xdr } from "@stellar/stellar-sdk";
import { getTransaction, isNotFound } from "@/lib/horizon";
import CopyButton from "@/components/CopyButton";
import { getInvocationReturnValue } from "@/lib/soroban";
import { decodeInvocation, decodeTransactionFailure, getResourceUsage } from "@/lib/xdr";
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

  // Everything above came from Horizon's JSON and is already good. If the
  // envelope itself won't parse — a protocol upgrade introducing an operation
  // this SDK doesn't know, say — that's no reason to throw away the status,
  // fee and timestamp we can already show.
  let envelope: xdr.TransactionEnvelope | null = null;
  try {
    envelope = xdr.TransactionEnvelope.fromXDR(tx.envelopeXdr, "base64");
  } catch {
    envelope = null;
  }

  // Null for a successful transaction, so this also double-checks Horizon's
  // own `successful` flag against what the result XDR actually says.
  const outcome = tx.successful ? null : decodeTransactionFailure(tx.resultXdr);
  const failure = outcome?.status === "failed" ? outcome.failure : null;
  const failureUndecodable = outcome?.status === "undecodable";

  const invocation = envelope ? decodeInvocation(envelope) : null;
  const resources = envelope ? getResourceUsage(envelope) : null;
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

      {failure && (
        <div className="mt-6 rounded-xl border border-prism-red/30 bg-prism-red/10 p-5">
          <h2 className="text-sm font-semibold text-prism-red mb-1">
            Failed: <span className="font-mono">{failure.resultCode}</span>
          </h2>
          {failure.operations.length === 0 ? (
            <p className="text-xs text-prism-red/80">
              This code applies to the transaction as a whole — it carries no per-operation results.
            </p>
          ) : (
            <>
              <p className="text-xs text-prism-red/80 mb-3">
                The ledger applies operations in order and then rolls the whole transaction back, so
                operations marked ok ran but were discarded.
              </p>
              <ol className="space-y-1">
                {failure.operations.map((op) => (
                  <li key={op.index} className="flex gap-2 text-xs font-mono">
                    <span className="text-prism-muted w-8 shrink-0">#{op.index}</span>
                    <span className={op.failed ? "text-prism-red font-bold" : "text-prism-muted"}>
                      {op.code}
                    </span>
                    {op.failed && <span className="text-prism-red">&larr; failed here</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {failureUndecodable && (
        <div className="mt-6 rounded-xl border border-prism-red/30 bg-prism-red/10 p-4">
          <p className="text-xs text-prism-red">
            Prism couldn&apos;t decode the failure reason for this transaction. The raw result can
            still be inspected in the XDR decoder.
          </p>
          <Link
            href={`/xdr?input=${encodeURIComponent(tx.resultXdr)}`}
            className="text-xs text-prism-accent hover:underline mt-2 inline-block"
          >
            Inspect the raw result in the XDR decoder &rarr;
          </Link>
        </div>
      )}

      {!envelope && (
        <div className="mt-6 rounded-xl border border-prism-red/30 bg-prism-red/10 p-4">
          <p className="text-xs text-prism-red">
            Prism couldn&apos;t decode this transaction&apos;s envelope, so any contract call it
            contains isn&apos;t shown above. The details that come straight from Horizon are
            unaffected. This usually means the transaction uses something newer than the XDR
            definitions Prism was built against.
          </p>
          <Link
            href={`/xdr?input=${encodeURIComponent(tx.envelopeXdr)}`}
            className="text-xs text-prism-accent hover:underline mt-2 inline-block"
          >
            Inspect the raw envelope in the XDR decoder &rarr;
          </Link>
        </div>
      )}

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
