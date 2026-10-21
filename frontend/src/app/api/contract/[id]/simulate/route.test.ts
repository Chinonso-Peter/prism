/**
 * Tests for the simulate route's contract type support (#30).
 *
 * Verifies that the POST /api/contract/[id]/simulate endpoint:
 *   - accepts an optional `types` array and passes it to coerceArgInput
 *   - fetches types from the WASM (via getContractWasmInfo) when none are
 *     supplied by the caller
 *   - still works when no types are available at all (primitive-only args)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/soroban", () => ({
  simulateInvocation: vi.fn(),
  getContractWasmInfo: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimitRequest: vi.fn(() => null),
}));
vi.mock("@/lib/xdr", () => ({
  coerceArgInput: vi.fn((value: string) => ({ type: "scvString", value })),
}));

import { POST } from "./route";
import { simulateInvocation, getContractWasmInfo } from "@/lib/soroban";
import { coerceArgInput } from "@/lib/xdr";

const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

function makeRequest(body: unknown): Request {
  return new Request(`http://localhost/api/contract/${CONTRACT_ID}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: { id: CONTRACT_ID } };

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/contract/[id]/simulate — type definitions (#30)", () => {
  it("returns 400 when functionName is missing", async () => {
    const res = await POST(makeRequest({}), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/functionName/i);
  });

  it("uses caller-supplied types when they are present", async () => {
    const callerTypes = [
      { kind: "struct" as const, name: "MyStruct", fields: [{ name: "amount", type: "u64" }] },
    ];
    vi.mocked(simulateInvocation).mockResolvedValue({ success: true, returnValue: "ok" });

    await POST(
      makeRequest({
        functionName: "transfer",
        args: [{ value: "42", type: "u64" }],
        types: callerTypes,
      }),
      params
    );

    expect(coerceArgInput).toHaveBeenCalledWith("42", "u64", callerTypes);
    // WASM should NOT be fetched when types are supplied by the caller.
    expect(getContractWasmInfo).not.toHaveBeenCalled();
  });

  it("fetches types from the WASM when no types are supplied by the caller", async () => {
    const wasmTypes = [
      { kind: "enum" as const, name: "Status", cases: [{ name: "Active", value: 1 }] },
    ];
    vi.mocked(getContractWasmInfo).mockResolvedValue({
      size: 100,
      functions: [],
      events: [],
      types: wasmTypes,
    });
    vi.mocked(simulateInvocation).mockResolvedValue({ success: true });

    await POST(
      makeRequest({ functionName: "check", args: [{ value: "1", type: "u32" }] }),
      params
    );

    expect(getContractWasmInfo).toHaveBeenCalledWith(CONTRACT_ID);
    expect(coerceArgInput).toHaveBeenCalledWith("1", "u32", wasmTypes);
  });

  it("falls back to an empty types list when getContractWasmInfo returns null", async () => {
    vi.mocked(getContractWasmInfo).mockResolvedValue(null);
    vi.mocked(simulateInvocation).mockResolvedValue({ success: true });

    await POST(makeRequest({ functionName: "hello" }), params);

    expect(coerceArgInput).not.toHaveBeenCalled(); // no args
    expect(simulateInvocation).toHaveBeenCalledWith(CONTRACT_ID, "hello", []);
  });

  it("returns 200 with the simulation result on success", async () => {
    vi.mocked(getContractWasmInfo).mockResolvedValue(null);
    vi.mocked(simulateInvocation).mockResolvedValue({
      success: true,
      returnValue: "42",
      instructions: 1000,
    });

    const res = await POST(makeRequest({ functionName: "get_value" }), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.returnValue).toBe("42");
  });
});
