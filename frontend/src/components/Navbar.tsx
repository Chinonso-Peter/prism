import Link from "next/link";
import SearchBar from "./SearchBar";
import NavLinks from "./NavLinks";
import { config, type StellarNetwork } from "@/lib/config";

/**
 * Contract IDs and tx hashes look identical across networks, so the badge is
 * load-bearing: it's the only thing on screen that says which chain you're
 * reading. Mainnet is deliberately the calm colour and the test networks the
 * loud ones — seeing test data and believing it's mainnet is the costly
 * mistake, not the reverse.
 */
const NETWORK_STYLES: Record<StellarNetwork, string> = {
  mainnet: "bg-prism-green/15 text-prism-green border-prism-green/30",
  testnet: "bg-prism-accent/15 text-prism-accent border-prism-accent/30",
  futurenet: "bg-prism-red/15 text-prism-red border-prism-red/30",
};

export default function Navbar() {
  return (
    <nav className="border-b border-prism-border bg-prism-surface px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3 sm:gap-6">
        <Link href="/explorer" className="flex items-center gap-2 shrink-0">
          <span className="text-lg font-bold text-prism-strong">Prism</span>
          <span
            className={`font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
              NETWORK_STYLES[config.network]
            }`}
          >
            {config.network}
          </span>
        </Link>
        <div className="flex-1 min-w-0 w-full sm:w-auto order-last sm:order-none">
          <SearchBar />
        </div>
        <div className="flex gap-5 text-sm text-prism-muted shrink-0">
          <Link href="/explorer" className="hover:text-prism-strong transition">Home</Link>
          <Link href="/xdr" className="hover:text-prism-strong transition">XDR</Link>
          <Link href="/docs" className="hover:text-prism-strong transition">API</Link>
          <a
            href="https://github.com/prism-explorer/prism"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-prism-strong transition"
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
