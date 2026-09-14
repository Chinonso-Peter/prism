import Link from "next/link";
import SearchBar from "@/components/SearchBar";

/**
 * Reached when Horizon positively reported a record as missing, or the route
 * doesn't exist. A failure to *reach* Horizon renders error.tsx instead —
 * telling someone their transaction doesn't exist because our endpoint timed
 * out would be a claim about the chain we have no basis for.
 */
export default function NotFound() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-2">Not found</h1>
      <p className="text-prism-muted text-sm mb-6">
        This network has no record with that identifier. Check it for typos — and check the network
        badge in the header, because identifiers look identical across networks and something that
        exists on testnet won&apos;t be found on mainnet.
      </p>

      <div className="mb-6">
        <SearchBar />
      </div>

      <Link
        href="/explorer"
        className="border border-prism-border px-4 py-2 rounded-lg text-xs font-medium text-prism-muted hover:text-white transition inline-block"
      >
        Back to the explorer
      </Link>
    </div>
  );
}
