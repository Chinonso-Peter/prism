import { getAccount, isNotFound } from "@/lib/horizon";
import CopyButton from "@/components/CopyButton";
import DetailRow from "@/components/DetailRow";
import { formatNumber, shortHash } from "@/lib/format";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props { params: { id: string } }

export default async function AccountPage({ params }: Props) {
  let account;
  try {
    account = await getAccount(params.id);
  } catch (err) {
    // Only a real 404 means "no such account". Anything else — Horizon down,
    // a timeout, a 5xx — is our problem, not the reader's, and saying "not
    // found" would tell them something false about the chain.
    if (isNotFound(err)) notFound();
    throw err;
  }

  const flagLabels = [
    account.flags.authRequired && "auth required",
    account.flags.authRevocable && "auth revocable",
    account.flags.authImmutable && "auth immutable",
    account.flags.authClawbackEnabled && "clawback enabled",
  ].filter(Boolean);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Account</h1>
      <div className="flex items-start gap-2 mb-8">
        <p className="text-prism-muted font-mono text-sm break-all">{params.id}</p>
        <CopyButton value={params.id} what="account address" />
      </div>

      <div className="rounded-xl border border-prism-border bg-prism-surface p-6 space-y-4 mb-8">
        <DetailRow label="Sequence" value={account.sequence} mono />
        <DetailRow label="Subentries" value={String(account.subentryCount)} />
        <DetailRow label="Signers" value={String(account.signerCount)} />
        <DetailRow label="Last Modified Ledger" value={`#${formatNumber(account.lastModifiedLedger)}`} />
        <DetailRow
          label="Thresholds"
          value={`low ${account.thresholds.low} / med ${account.thresholds.med} / high ${account.thresholds.high}`}
        />
        <DetailRow label="Flags" value={flagLabels.length > 0 ? flagLabels.join(", ") : "none"} />
      </div>

      <h2 className="text-lg font-semibold mb-3">Balances</h2>
      <div className="rounded-xl border border-prism-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-prism-surface border-b border-prism-border">
            <tr>
              <th className="text-left px-4 py-3 text-prism-muted font-medium">Asset</th>
              <th className="text-right px-4 py-3 text-prism-muted font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {account.balances.map((b, i) => (
              <tr key={i} className="border-b border-prism-border last:border-0">
                <td className="px-4 py-3 font-mono text-xs">
                  {b.assetType === "native"
                    ? "XLM"
                    : `${b.assetCode}:${b.assetIssuer ? shortHash(b.assetIssuer, 4) : ""}`}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">{b.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
