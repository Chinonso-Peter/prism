"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Shown when a page fails for a reason that isn't "this record doesn't exist"
 * — Horizon or the RPC node being unreachable, a timeout, a 5xx. Those used to
 * surface as a 404, which told the reader something false about the chain.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-2">Couldn&apos;t load this page</h1>
      <p className="text-prism-muted text-sm mb-6">
        Prism reached for data and didn&apos;t get it. That usually means the configured Horizon or
        Soroban RPC endpoint is unreachable, overloaded, or timing out — not that what you searched for
        is missing.
      </p>

      <div className="flex gap-2">
        <button
          onClick={reset}
          className="bg-prism-accent text-white px-4 py-2 rounded-lg text-xs font-medium hover:opacity-90 transition"
        >
          Try again
        </button>
        <Link
          href="/explorer"
          className="border border-prism-border px-4 py-2 rounded-lg text-xs font-medium text-prism-muted hover:text-prism-strong transition"
        >
          Back to the explorer
        </Link>
      </div>

      {error.digest && (
        <p className="text-xs text-prism-muted font-mono mt-6">Reference: {error.digest}</p>
      )}
    </div>
  );
}
