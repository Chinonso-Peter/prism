import SearchBar from "@/components/SearchBar";
import LedgerStats from "@/components/LedgerStats";
import TransactionCard from "@/components/TransactionCard";
import AutoRefresh from "@/components/AutoRefresh";
import EmptyState from "@/components/EmptyState";
import { getLatestLedger, getRecentTransactions } from "@/lib/horizon";
import type { TransactionRecord } from "@/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let ledger = null;
  let transactions: TransactionRecord[] = [];

  try {
    [ledger, transactions] = await Promise.all([
      getLatestLedger(),
      getRecentTransactions(10),
    ]);
  } catch {
    // Network unavailable during build or runtime — render gracefully
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
        {transactions.length === 0 ? (
          <EmptyState>Connecting to Stellar network…</EmptyState>
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
