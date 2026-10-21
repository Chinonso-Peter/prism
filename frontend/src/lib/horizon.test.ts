import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

function mockFetchOnce(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("getLatestLedger", () => {
  it("derives transactionCount from successful + failed counts (Horizon has no transaction_count field)", async () => {
    mockFetchOnce({
      _embedded: {
        records: [
          {
            sequence: 4064026,
            hash: "abc",
            closed_at: "2026-08-10T00:00:00Z",
            operation_count: 10,
            base_fee_in_stroops: 100,
            successful_transaction_count: 7,
            failed_transaction_count: 2,
          },
        ],
      },
    });
    const { getLatestLedger } = await import("./horizon");
    const ledger = await getLatestLedger();
    expect(ledger.transactionCount).toBe(9);
    expect(ledger.sequence).toBe(4064026);
  });
});

describe("getNetworkPulse", () => {
  it("computes TPS and close time from the two most recent ledgers", async () => {
    mockFetchOnce({
      _embedded: {
        records: [
          {
            sequence: 100,
            closed_at: "2026-08-10T00:00:10Z",
            operation_count: 20,
            base_fee_in_stroops: 100,
            successful_transaction_count: 8,
            failed_transaction_count: 2,
          },
          {
            sequence: 99,
            closed_at: "2026-08-10T00:00:05Z",
            operation_count: 15,
            base_fee_in_stroops: 100,
            successful_transaction_count: 5,
            failed_transaction_count: 0,
          },
        ],
      },
    });
    const { getNetworkPulse } = await import("./horizon");
    const pulse = await getNetworkPulse();
    expect(pulse.closeTimeSeconds).toBe(5);
    expect(pulse.transactionsPerSecond).toBe(2); // 10 txs / 5s
    expect(pulse.sequence).toBe(100);
  });
});

describe("getTransaction", () => {
  const transaction = {
    hash: "deadbeef",
    ledger: 4671563,
    created_at: "2026-09-14T10:23:22Z",
    source_account: "GCLWKHHH",
    // Horizon sends int64 fields as JSON strings; fees can exceed 2^53.
    fee_charged: "1234567",
    operation_count: 1,
    successful: true,
    memo: null,
    envelope_xdr: "AAAAAg==",
  };

  it("throws on a non-ok response instead of returning partial data", async () => {
    mockFetchOnce({}, false);
    const { getTransaction } = await import("./horizon");
    await expect(getTransaction("deadbeef")).rejects.toThrow(/Horizon error 500/);
  });

  it("distinguishes a missing transaction from an unreachable Horizon", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const { getTransaction, isNotFound } = await import("./horizon");

    const missing = await getTransaction("deadbeef").catch((e) => e);
    expect(isNotFound(missing)).toBe(true);
    expect(missing.status).toBe(404);
  });

  it("does not report a server error as not-found", async () => {
    mockFetchOnce({}, false); // 500
    const { getTransaction, isNotFound } = await import("./horizon");

    const failed = await getTransaction("deadbeef").catch((e) => e);
    expect(isNotFound(failed)).toBe(false);
    expect(failed.status).toBe(500);
  });

  it("treats a non-Horizon error as not-found-negative", async () => {
    const { isNotFound } = await import("./horizon");
    expect(isNotFound(new Error("boom"))).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
  });

  it("converts Horizon's string fee into a number", async () => {
    mockFetchOnce(transaction);
    const { getTransaction } = await import("./horizon");
    const tx = await getTransaction("deadbeef");

    expect(tx.fee).toBe(1234567);
    expect(typeof tx.fee).toBe("number");
    // The point of the conversion: a string has no thousands separators, so
    // passing one through renders "1234567 stroops" instead of "1,234,567".
    expect(tx.fee.toLocaleString()).toBe((1234567).toLocaleString());
  });

  it("accepts a numeric fee too, rather than assuming one encoding", async () => {
    mockFetchOnce({ ...transaction, fee_charged: 100 });
    const { getTransaction } = await import("./horizon");
    expect((await getTransaction("deadbeef")).fee).toBe(100);
  });

  it("reports an absent memo as undefined, not null", async () => {
    mockFetchOnce(transaction);
    const { getTransaction } = await import("./horizon");
    expect(await getTransaction("deadbeef").then((t) => t.memo)).toBeUndefined();
  });

  it("keeps a memo that is present", async () => {
    mockFetchOnce({ ...transaction, memo: "hello" });
    const { getTransaction } = await import("./horizon");
    expect((await getTransaction("deadbeef")).memo).toBe("hello");
  });
});

describe("getLedger (issue #35 — finalized cache)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sequence: 1000,
        hash: "abc",
        closed_at: "2026-08-10T00:00:00Z",
        operation_count: 5,
        base_fee_in_stroops: 100,
        successful_transaction_count: 3,
        failed_transaction_count: 1,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("uses a longer revalidate window for a finalized ledger", async () => {
    const { getLedger } = await import("./horizon");
    await getLedger(1000);
    const options = fetchMock.mock.calls[0][1] as RequestInit & { next?: { revalidate?: number } };
    expect(options.next?.revalidate).toBeGreaterThan(10);
  });
});

describe("getTransaction (issue #35 — finalized cache)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        hash: "deadbeef",
        ledger: 4671563,
        created_at: "2026-09-14T10:23:22Z",
        source_account: "GCLWKHHH",
        fee_charged: "100",
        operation_count: 1,
        successful: true,
        memo: null,
        envelope_xdr: "AAAAAg==",
        result_xdr: "AAAAAg==",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("uses a longer revalidate window for a closed transaction", async () => {
    const { getTransaction } = await import("./horizon");
    await getTransaction("deadbeef");
    const options = fetchMock.mock.calls[0][1] as RequestInit & { next?: { revalidate?: number } };
    expect(options.next?.revalidate).toBeGreaterThan(10);
  });
});

describe("getAccount", () => {
  const account = {
    account_id: "GCLWKHHH",
    sequence: "1234",
    subentry_count: 0,
    last_modified_ledger: 4671563,
    thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    flags: { auth_required: false, auth_revocable: false, auth_immutable: false, auth_clawback_enabled: false },
    balances: [],
  };

  it("keeps the pool ID on liquidity pool share balances, which have no asset code", async () => {
    const poolId = "dd7b1ab831c273310ddbec6f97870aa83c2fbd78ce22aded37ecbf4f3380fac7";
    mockFetchOnce({
      ...account,
      balances: [{ asset_type: "liquidity_pool_shares", liquidity_pool_id: poolId, balance: "5.0000000" }],
    });
    const { getAccount } = await import("./horizon");
    const [balance] = (await getAccount("GCLWKHHH")).balances;
    expect(balance.liquidityPoolId).toBe(poolId);
    expect(balance.assetCode).toBeUndefined();
  });
});
