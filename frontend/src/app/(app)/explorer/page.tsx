import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import LedgerStats from "@/components/LedgerStats";
import TransactionCard from "@/components/TransactionCard";
import AutoRefresh from "@/components/AutoRefresh";
import EmptyState from "@/components/EmptyState";
import { getLatestLedger, getRecentTransactions } from "@/lib/horizon";
import type { LedgerRecord, TransactionRecord } from "@/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let ledger: LedgerRecord | null = null;
  let transactions: TransactionRecord[] = [];
  let loadFailed = false;

  try {
    [ledger, transactions] = await Promise.all([
      getLatestLedger(),
      getRecentTransactions(10),
    ]);
  } catch {
    // Horizon didn't answer. That is not the same as an empty network, so say so.
    loadFailed = true;
  }

  return (
    <div>
      <AutoRefresh intervalMs={6000} />

      <section className="text-center py-12">
        <h1 className="text-4xl font-bold mb-2">Prism</h1>
        <p className="text-prism-muted mb-8">
          Soroban-native block explorer for the Stellar network
        </p>
        <SearchBar />
      </section>

      {ledger && <LedgerStats ledger={ledger} />}

      <section className="mt-10">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          Recent Transactions
          <span className="flex items-center gap-1.5 text-xs font-normal text-prism-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-prism-green animate-pulse" />
            auto-updating
          </span>
        </h2>
        {loadFailed ? (
          <div role="alert" className="border border-prism-border rounded-lg p-4 text-sm">
            <p className="font-medium mb-1">Couldn&apos;t reach the Stellar network</p>
            <p className="text-prism-muted">
              Horizon didn&apos;t answer, so the latest ledger and transactions aren&apos;t available.{" "}
              <Link href="/explorer" className="underline hover:text-prism-strong">
                Try again
              </Link>
            </p>
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState>No recent transactions.</EmptyState>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <TransactionCard key={tx.hash} tx={tx} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
