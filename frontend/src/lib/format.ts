// Display formatting utilities for Prism

import type { AccountBalance } from "@/types";

/** Shorten a hash or address: "GABCD...XYZ" */
export function shortHash(hash: string, chars = 6): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

/**
 * A readable label for an account balance's asset.
 *
 * Liquidity pool shares have no asset code, so they are labelled with a
 * shortened pool ID. Any other balance with no code falls back to its asset
 * type, rather than printing "undefined".
 */
export function balanceLabel(balance: AccountBalance): string {
  if (balance.assetType === "native") return "XLM";
  if (balance.assetType === "liquidity_pool_shares" && balance.liquidityPoolId) {
    return `Pool ${shortHash(balance.liquidityPoolId, 6)}`;
  }
  if (balance.assetCode) {
    return `${balance.assetCode}:${balance.assetIssuer ? shortHash(balance.assetIssuer, 4) : ""}`;
  }
  return balance.assetType;
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
