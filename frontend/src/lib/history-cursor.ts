/**
 * Keyset paging over a contract's indexed history. A cursor names the last row
 * a page returned, by its ledger and id, and the next page starts strictly
 * after it — so rows are neither repeated nor skipped when newer rows arrive.
 */

/** The most rows one page may return. */
export const MAX_PAGE_SIZE = 100;

export interface HistoryCursor {
  ledger: number;
  id: string;
}

export interface PageRequest {
  limit: number;
  before?: HistoryCursor;
}

export interface HistoryPage<T> {
  items: T[];
  /** Pass back as `cursor` to get the rows after this page; null when this is the last page. */
  nextCursor: string | null;
}

export function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify([cursor.ledger, cursor.id])).toString("base64url");
}

function decodeCursor(raw: string): HistoryCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (Array.isArray(parsed) && Number.isInteger(parsed[0]) && typeof parsed[1] === "string") {
      return { ledger: parsed[0], id: parsed[1] };
    }
  } catch {
    // Not base64url JSON: handled below like any other malformed cursor.
  }
  return null;
}

/**
 * Read `limit` and `cursor` from a request URL. A missing or non-numeric limit
 * takes the default, and any other limit is clamped to 1..MAX_PAGE_SIZE.
 * Returns null when a cursor was given but isn't one encodeCursor produced.
 */
export function parsePageRequest(url: URL, defaultLimit: number): PageRequest | null {
  const rawLimit = Number(url.searchParams.get("limit") ?? defaultLimit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(rawLimit)))
    : defaultLimit;

  const rawCursor = url.searchParams.get("cursor");
  if (rawCursor === null) return { limit };
  const before = decodeCursor(rawCursor);
  return before ? { limit, before } : null;
}

interface PagedRow {
  ledger: number;
  id: string;
}

/**
 * Split a query that fetched `limit + 1` rows into the page itself and the
 * cursor for the page after it. The extra row only signals that more exist.
 */
export function takePage<R extends PagedRow>(
  rows: R[],
  limit: number
): { rows: R[]; nextCursor: string | null } {
  if (rows.length <= limit) return { rows, nextCursor: null };
  const page = rows.slice(0, limit);
  const last = page[limit - 1];
  return { rows: page, nextCursor: encodeCursor({ ledger: last.ledger, id: last.id }) };
}
