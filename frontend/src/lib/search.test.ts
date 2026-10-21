import { describe, expect, it } from "vitest";
import { resolveSearchRoute } from "./search";

const TX = "a".repeat(64);
const CONTRACT = "C" + "A".repeat(55);
const ACCOUNT = "G" + "A".repeat(55);

describe("resolveSearchRoute", () => {
  it("routes a 64-char hex string to /tx", () => {
    expect(resolveSearchRoute(TX)).toBe(`/tx/${TX}`);
  });

  it("routes a C-strkey to /contract", () => {
    expect(resolveSearchRoute(CONTRACT)).toBe(`/contract/${CONTRACT}`);
  });

  it("routes a G-strkey to /account", () => {
    expect(resolveSearchRoute(ACCOUNT)).toBe(`/account/${ACCOUNT}`);
  });

  it("routes a decimal string to /ledger", () => {
    expect(resolveSearchRoute("1234567")).toBe("/ledger/1234567");
  });

  it("routes an unrecognised query to /search", () => {
    expect(resolveSearchRoute("hello world")).toBe("/search?q=hello%20world");
  });

  it("rejects a 56-char string starting with C but containing non-base32 chars", () => {
    // Lowercase letters are not valid base-32 — should fall through to /search
    const bad = "C" + "a".repeat(55);
    expect(resolveSearchRoute(bad)).toBe(`/search?q=${encodeURIComponent(bad)}`);
  });

  it("rejects a 56-char string starting with C but wrong length", () => {
    const short = "C" + "A".repeat(50);
    expect(resolveSearchRoute(short)).toBe(`/search?q=${encodeURIComponent(short)}`);
  });

  it("trims whitespace before routing", () => {
    expect(resolveSearchRoute("  " + TX + "  ")).toBe(`/tx/${TX}`);
  });

  it("returns null for empty input", () => {
    expect(resolveSearchRoute("")).toBeNull();
    expect(resolveSearchRoute("   ")).toBeNull();
  });
});
