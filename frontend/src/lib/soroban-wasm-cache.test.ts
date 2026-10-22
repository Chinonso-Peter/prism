/**
 * Tests for the WASM ABI cache (#33).
 *
 * A WASM with a given hash is immutable on-chain, so the parsed ABI result
 * should be served from cache on subsequent calls without making a second
 * `getContractWasmByContractId` RPC call.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { rpc } from "@stellar/stellar-sdk";

vi.mock("./indexed-db", () => ({
  isIndexerConfigured: vi.fn(() => false),
  getIndexedEvents: vi.fn(),
  getIndexedInvocations: vi.fn(),
  getIndexedStorageEntries: vi.fn(),
}));

import { getContractWasmInfo, _clearWasmAbiCacheForTesting } from "./soroban";

const WASM_HASH = "ab".repeat(32);

function makeInstanceData() {
  return {
    val: {
      contractData: () => ({
        val: () => ({
          instance: () => ({
            executable: () => ({
              switch: () => ({ name: "contractExecutableWasm" }),
              wasmHash: () => Buffer.from(WASM_HASH, "hex"),
            }),
            storage: () => [],
          }),
        }),
      }),
    },
    liveUntilLedgerSeq: 1000,
    lastModifiedLedgerSeq: 500,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  _clearWasmAbiCacheForTesting();
});

describe("getContractWasmInfo WASM ABI cache (#33)", () => {
  it("fetches the WASM on the first call", async () => {
    vi.spyOn(rpc.Server.prototype, "getContractData").mockResolvedValue(
      makeInstanceData() as never
    );
    const wasmSpy = vi
      .spyOn(rpc.Server.prototype, "getContractWasmByContractId")
      .mockResolvedValue(Buffer.alloc(100) as never);

    await getContractWasmInfo("contract-id");

    expect(wasmSpy).toHaveBeenCalledOnce();
  });

  it("does NOT call getContractWasmByContractId on a second request for the same contract", async () => {
    vi.spyOn(rpc.Server.prototype, "getContractData").mockResolvedValue(
      makeInstanceData() as never
    );
    const wasmSpy = vi
      .spyOn(rpc.Server.prototype, "getContractWasmByContractId")
      .mockResolvedValue(Buffer.alloc(100) as never);

    await getContractWasmInfo("contract-id");
    await getContractWasmInfo("contract-id");

    // WASM downloaded exactly once; second call served from cache.
    expect(wasmSpy).toHaveBeenCalledOnce();
  });

  it("returns the same object on a cache hit", async () => {
    vi.spyOn(rpc.Server.prototype, "getContractData").mockResolvedValue(
      makeInstanceData() as never
    );
    vi.spyOn(rpc.Server.prototype, "getContractWasmByContractId").mockResolvedValue(
      Buffer.alloc(100) as never
    );

    const first = await getContractWasmInfo("contract-id");
    const second = await getContractWasmInfo("contract-id");

    expect(second).toBe(first);
  });

  it("fetches the WASM again after the cache is cleared", async () => {
    vi.spyOn(rpc.Server.prototype, "getContractData").mockResolvedValue(
      makeInstanceData() as never
    );
    const wasmSpy = vi
      .spyOn(rpc.Server.prototype, "getContractWasmByContractId")
      .mockResolvedValue(Buffer.alloc(100) as never);

    await getContractWasmInfo("contract-id");
    _clearWasmAbiCacheForTesting();
    await getContractWasmInfo("contract-id");

    expect(wasmSpy).toHaveBeenCalledTimes(2);
  });

  it("returns null when the RPC call fails", async () => {
    vi.spyOn(rpc.Server.prototype, "getContractData").mockRejectedValue(
      new Error("RPC down")
    );

    await expect(getContractWasmInfo("contract-id")).resolves.toBeNull();
  });
});
