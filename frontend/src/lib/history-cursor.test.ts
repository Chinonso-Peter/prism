import { describe, expect, it } from "vitest";
import {
  MAX_PAGE_SIZE,
  encodeCursor,
  parsePageRequest,
  takePage,
  type HistoryCursor,
} from "./history-cursor";

function url(query: string) {
  return new URL(`https://prism.test/api/contract/C1/events${query}`);
}

describe("parsePageRequest", () => {
  it("uses the default limit when none is given", () => {
    expect(parsePageRequest(url(""), 50)).toEqual({ limit: 50 });
  });

  it("clamps the limit to the page size range", () => {
    expect(parsePageRequest(url("?limit=100000"), 50)).toEqual({ limit: MAX_PAGE_SIZE });
    expect(parsePageRequest(url("?limit=0"), 50)).toEqual({ limit: 1 });
    expect(parsePageRequest(url("?limit=-5"), 50)).toEqual({ limit: 1 });
  });

  it("falls back to the default for a non-numeric limit", () => {
    expect(parsePageRequest(url("?limit=abc"), 20)).toEqual({ limit: 20 });
  });

  it("reads a cursor that encodeCursor produced", () => {
    const cursor = { ledger: 4064026, id: "ckx9z0abc" };
    const request = parsePageRequest(url(`?cursor=${encodeCursor(cursor)}`), 50);
    expect(request).toEqual({ limit: 50, before: cursor });
  });

  it("rejects a cursor it did not produce", () => {
    expect(parsePageRequest(url("?cursor=not-a-cursor"), 50)).toBeNull();
    expect(parsePageRequest(url(`?cursor=${Buffer.from('{"a":1}').toString("base64url")}`), 50)).toBeNull();
    expect(parsePageRequest(url(`?cursor=${Buffer.from('[1.5,"x"]').toString("base64url")}`), 50)).toBeNull();
  });
});

describe("takePage", () => {
  const rows = [
    { ledger: 3, id: "c" },
    { ledger: 2, id: "b" },
    { ledger: 1, id: "a" },
  ];

  it("returns no next cursor when everything fits", () => {
    expect(takePage(rows, 3)).toEqual({ rows, nextCursor: null });
  });

  it("drops the extra row and points the cursor at the last row kept", () => {
    const page = takePage(rows, 2);
    expect(page.rows).toEqual([rows[0], rows[1]]);
    expect(page.nextCursor).toBe(encodeCursor({ ledger: 2, id: "b" }));
  });
});

describe("paging a history with a keyset cursor", () => {
  // The same rule the SQL applies: newest first by (ledger, id), each page strictly
  // after the cursor. Ties on ledger are broken by id, so the order is total.
  const history: HistoryCursor[] = Array.from({ length: 120 }, (_, i) => ({
    ledger: 1000 + Math.floor(i / 7),
    id: `row-${String(i).padStart(3, "0")}`,
  }));
  const ordered = [...history].sort((a, b) =>
    b.ledger !== a.ledger ? b.ledger - a.ledger : b.id.localeCompare(a.id)
  );

  function queryAfter(before: HistoryCursor | undefined, limit: number) {
    const eligible = before
      ? ordered.filter((r) => r.ledger < before.ledger || (r.ledger === before.ledger && r.id < before.id))
      : ordered;
    return eligible.slice(0, limit + 1);
  }

  it("returns every row exactly once across pages", () => {
    const seen: HistoryCursor[] = [];
    let request = parsePageRequest(url("?limit=25"), 50);
    while (request) {
      const page = takePage(queryAfter(request.before, request.limit), request.limit);
      seen.push(...page.rows);
      if (!page.nextCursor) break;
      request = parsePageRequest(url(`?limit=25&cursor=${page.nextCursor}`), 50);
    }

    expect(seen).toHaveLength(120);
    expect(new Set(seen.map((r) => r.id)).size).toBe(120);
    expect(seen).toEqual(ordered);
  });
});
