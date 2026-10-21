// Display formatting utilities for Prism

/** Shorten a hash or address: "GABCD...XYZ" */
export function shortHash(hash: string, chars = 6): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

/** Format stroops to XLM string: 1_000_000 → "0.1 XLM" */
export function stroopsToXlm(stroops: number): string {
  return `${(stroops / 10_000_000).toFixed(7)} XLM`;
}

/** Format a fee in stroops to a readable string */
export function formatFee(stroops: number): string {
  return `${stroops.toLocaleString()} stroops`;
}

/** Format an ISO date string to a human-friendly label */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Format an ISO timestamp as an absolute UTC label. Unlike formatDate, the
 * output doesn't depend on the machine's time zone or locale, so the server
 * and the browser render the same text.
 */
export function formatTimestampUtc(iso: string): string {
  const label = new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return `${label} UTC`;
}

/** Format a number with thousands separators */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Returns "X seconds/minutes/hours ago" for a given ISO timestamp */
export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Format a contract ID to a display-friendly form: "CAAAA...ZZZZ" */
export function formatContractId(id: string): string {
  return shortHash(id, 8);
}
