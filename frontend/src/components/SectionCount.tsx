/**
 * Whether a list is cut off. The indexer pages by cursor, so a next cursor is exact. The RPC
 * fallback never offers a cursor, so a list that fills its limit is treated as capped.
 */
export function isCapped(count: number, nextCursor: string | null, limit: number, rpcFallback: boolean): boolean {
  return nextCursor !== null || (rpcFallback && count >= limit);
}

/** Item count for a section header, with a "+" and a note when the list is capped. */
export default function SectionCount({ count, capped = false }: { count: number; capped?: boolean }) {
  return (
    <span
      className="text-sm font-normal text-prism-muted"
      title={capped ? `Showing the latest ${count}; older items are not shown` : undefined}
    >
      ({count}
      {capped && "+"})
      {capped && <span className="ml-1 text-xs">showing the latest {count}, older not shown</span>}
    </span>
  );
}
