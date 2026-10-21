/**
 * Resolves a raw search query to a Next.js route string, or null when the
 * query matches no known format. Both the SearchBar and the /search page
 * call this so they always agree on routing.
 *
 * Formats recognised:
 *  - Transaction hash: 64 lowercase hex characters
 *  - Contract ID: Soroban strkey — starts with C, 56 base-32 chars total
 *  - Account address: ED25519 strkey — starts with G, 56 base-32 chars total
 *  - Ledger sequence: one or more decimal digits
 */
export function resolveSearchRoute(raw: string): string | null {
  const q = raw.trim();
  if (!q) return null;

  if (/^[0-9a-fA-F]{64}$/.test(q)) return `/tx/${q}`;
  if (/^C[A-Z2-7]{55}$/.test(q)) return `/contract/${q}`;
  if (/^G[A-Z2-7]{55}$/.test(q)) return `/account/${q}`;
  if (/^\d+$/.test(q)) return `/ledger/${q}`;

  return `/search?q=${encodeURIComponent(q)}`;
}
