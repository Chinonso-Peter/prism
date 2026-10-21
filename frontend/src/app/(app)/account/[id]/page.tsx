import { getAccount, isNotFound } from "@/lib/horizon";
import CopyButton from "@/components/CopyButton";
import { formatNumber, shortHash } from "@/lib/format";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props { params: { id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const title = `Account ${shortHash(params.id, 6)}`;
  try {
    const account = await getAccount(params.id);
    const xlm = account.balances.find((b) => b.assetType === "native");
    const description = xlm
      ? `Stellar account ${params.id} — ${xlm.balance} XLM, ${account.subentryCount} subentries, ${account.signerCount} signers.`
      : `Stellar account ${params.id} — ${account.subentryCount} subentries, ${account.signerCount} signers.`;
    return {
      title,
      description,
      openGraph: { title, description },
    };
  } catch {
    return {
      title,
      description: `Stellar account ${params.id}.`,
    };
  }
}

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
        <Row label="Sequence" value={account.sequence} mono />
        <Row label="Subentries" value={String(account.subentryCount)} />
        <Row label="Signers" value={String(account.signerCount)} />
        <Row label="Last Modified Ledger" value={`#${formatNumber(account.lastModifiedLedger)}`} />
        <Row
          label="Thresholds"
          value={`low ${account.thresholds.low} / med ${account.thresholds.med} / high ${account.thresholds.high}`}
        />
        <Row label="Flags" value={flagLabels.length > 0 ? flagLabels.join(", ") : "none"} />
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-prism-border pb-3 last:border-0 last:pb-0 gap-4">
      <span className="text-prism-muted text-sm shrink-0">{label}</span>
      <span className={`text-sm text-right break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
