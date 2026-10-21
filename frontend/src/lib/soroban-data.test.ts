import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeToScVal, rpc, StrKey } from "@stellar/stellar-sdk";

vi.mock("./indexed-db", () => ({
  isIndexerConfigured: vi.fn(),
  getIndexedEvents: vi.fn(),
  getIndexedInvocations: vi.fn(),
  getIndexedStorageEntries: vi.fn(),
}));

import {
  getContractEvents,
  getContractInfo,
  getInvocationHistory,
  simulateInvocation,
} from "./soroban";
import {
  getIndexedEvents,
  getIndexedInvocations,
  isIndexerConfigured,
} from "./indexed-db";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function rpcEvent(txHash = "tx-1") {
  return {
    id: `event-${txHash}`,
    type: "contract",
    topic: [nativeToScVal("updated", { type: "symbol" })],
    value: nativeToScVal("hello", { type: "string" }),
    txHash,
    ledger: 100,
    ledgerClosedAt: "2026-01-01T00:00:00Z",
  };
}

describe("getContractInfo", () => {
  it("reads and formats contract instance data through RPC", async () => {
    vi.spyOn(rpc.Server.prototype, "getContractData").mockResolvedValue({
      val: {
        contractData: () => ({
          val: () => ({
            instance: () => ({
              executable: () => ({
                switch: () => ({ name: "contractExecutableWasm" }),
                wasmHash: () => Buffer.alloc(32, 1),
              }),
              storage: () => [],
            }),
          }),
        }),
      },
      liveUntilLedgerSeq: 200,
      lastModifiedLedgerSeq: 90,
    } as never);

    const info = await getContractInfo("contract-id");
    expect(info).toMatchObject({
      executable: "wasm",
      wasmHash: "01".repeat(32),
      liveUntilLedgerSeq: 200,
      lastModifiedLedgerSeq: 90,
      instanceStorage: [],
    });
    expect(rpc.Server.prototype.getContractData).toHaveBeenCalledOnce();
  });

  it("returns null when the RPC request fails", async () => {
    vi.spyOn(rpc.Server.prototype, "getContractData").mockRejectedValue(new Error("RPC down"));
    await expect(getContractInfo("contract-id")).resolves.toBeNull();
  });
});

describe("getContractEvents", () => {
  it("uses indexed events when the indexer is configured", async () => {
    vi.mocked(isIndexerConfigured).mockReturnValue(true);
    vi.mocked(getIndexedEvents).mockResolvedValue([
      {
        eventId: "indexed-1",
        type: "contract",
        topic: ["updated"],
        value: "hello",
        txHash: "tx-indexed",
        ledger: 123,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const rpcSpy = vi.spyOn(rpc.Server.prototype, "getLatestLedger");

    await expect(getContractEvents("contract-id", 3)).resolves.toEqual([
      {
        id: "indexed-1",
        contractId: "contract-id",
        type: "contract",
        topic: ["updated"],
        value: "hello",
        txHash: "tx-indexed",
        ledger: 123,
        timestamp: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(getIndexedEvents).toHaveBeenCalledWith("contract-id", 3);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("queries RPC and formats the event list when no indexer is configured", async () => {
    vi.mocked(isIndexerConfigured).mockReturnValue(false);
    vi.spyOn(rpc.Server.prototype, "getLatestLedger").mockResolvedValue({
      sequence: 20_000,
    } as never);
    vi.spyOn(rpc.Server.prototype, "getEvents").mockResolvedValue({
      events: [rpcEvent()],
    } as never);

    await expect(getContractEvents("contract-id", 4)).resolves.toMatchObject([
      {
        id: "event-tx-1",
        contractId: "contract-id",
        topic: ["updated"],
        value: "hello",
        txHash: "tx-1",
      },
    ]);
    expect(getIndexedEvents).not.toHaveBeenCalled();
  });

  it("returns an empty list when the RPC call fails or returns no events", async () => {
    vi.mocked(isIndexerConfigured).mockReturnValue(false);
    vi.spyOn(rpc.Server.prototype, "getLatestLedger").mockRejectedValue(new Error("RPC down"));
    await expect(getContractEvents("contract-id")).resolves.toEqual([]);

    vi.mocked(rpc.Server.prototype.getLatestLedger).mockResolvedValue({ sequence: 10 } as never);
    vi.spyOn(rpc.Server.prototype, "getEvents").mockResolvedValue({ events: [] } as never);
    await expect(getContractEvents("contract-id")).resolves.toEqual([]);
  });
});

describe("getInvocationHistory", () => {
  it("uses indexed invocations when the indexer is configured", async () => {
    vi.mocked(isIndexerConfigured).mockReturnValue(true);
    vi.mocked(getIndexedInvocations).mockResolvedValue([
      {
        txHash: "indexed-tx",
        ledger: 123,
        createdAt: "2026-01-01T00:00:00Z",
        functionName: "increment",
        args: [1, true],
        successful: true,
        sourceAccount: "GABC",
      },
    ]);
    const rpcSpy = vi.spyOn(rpc.Server.prototype, "getLatestLedger");

    await expect(getInvocationHistory("contract-id", 2)).resolves.toEqual([
      {
        txHash: "indexed-tx",
        ledger: 123,
        timestamp: "2026-01-01T00:00:00Z",
        functionName: "increment",
        args: ["1", "true"],
        successful: true,
      },
    ]);
    expect(getIndexedInvocations).toHaveBeenCalledWith("contract-id", 2);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("derives unique recent transactions from RPC events", async () => {
    vi.mocked(isIndexerConfigured).mockReturnValue(false);
    vi.spyOn(rpc.Server.prototype, "getLatestLedger").mockResolvedValue({
      sequence: 20_000,
    } as never);
    vi.spyOn(rpc.Server.prototype, "getEvents").mockResolvedValue({
      events: [rpcEvent(), rpcEvent(), rpcEvent("tx-2")],
    } as never);
    vi.spyOn(rpc.Server.prototype, "getTransaction").mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.NOT_FOUND,
    } as never);

    await expect(getInvocationHistory("contract-id")).resolves.toEqual([]);
    expect(rpc.Server.prototype.getTransaction).toHaveBeenCalledTimes(2);
    expect(getIndexedInvocations).not.toHaveBeenCalled();
  });
});

describe("simulateInvocation", () => {
  it("reports an RPC failure as an unsuccessful simulation", async () => {
    const contractId = StrKey.encodeContract(Buffer.alloc(32, 1));
    vi.spyOn(rpc.Server.prototype, "simulateTransaction").mockRejectedValue(
      new Error("RPC unavailable")
    );

    await expect(simulateInvocation(contractId, "hello", [])).resolves.toEqual({
      success: false,
      error: "RPC unavailable",
    });
    expect(rpc.Server.prototype.simulateTransaction).toHaveBeenCalledOnce();
  });
});
