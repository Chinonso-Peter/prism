import { describe, expect, it, vi } from "vitest";
import { decodeXdrAction } from "./actions";

vi.mock("./xdr", () => ({
  decodeAnyXdr: vi.fn().mockReturnValue(null),
  coerceArgInput: vi.fn(),
}));

vi.mock("./soroban", () => ({
  lookupStorageEntry: vi.fn(),
  parseStorageKeyInput: vi.fn(),
  simulateInvocation: vi.fn(),
}));

describe("decodeXdrAction (issue #44 — XDR size cap)", () => {
  it("rejects empty input", async () => {
    const result = await decodeXdrAction("   ");
    expect(result).toHaveProperty("error");
  });

  it("rejects input larger than 64 KB", async () => {
    const oversized = "A".repeat(64 * 1024 + 1);
    const result = await decodeXdrAction(oversized);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/too large/i);
  });

  it("accepts input exactly at the 64 KB limit without the size error", async () => {
    const atLimit = "A".repeat(64 * 1024);
    const result = await decodeXdrAction(atLimit);
    // decodeAnyXdr is mocked to return null — the "not valid XDR" error is expected,
    // but the "too large" guard must not fire.
    expect((result as { error: string }).error).not.toMatch(/too large/i);
  });
});
