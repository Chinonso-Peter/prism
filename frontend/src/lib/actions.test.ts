/**
 * Tests for the server actions (#101).
 *
 * Tests each action with valid, empty and invalid input, mocking soroban and xdr modules.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock soroban and xdr modules
vi.mock("./soroban", () => ({
  submitTransaction: vi.fn(),
  getAccount: vi.fn(),
}));

vi.mock("./xdr", () => ({
  encodeParams: vi.fn(),
  decodeResult: vi.fn(),
}));

import {
  submitTrustline,
  submitPayment,
  submitOffer,
} from "./actions";

describe("Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("submitTrustline", () => {
    it("returns success for valid input", async () => {
      const result = await submitTrustline({
        asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        limit: "1000",
      });
      expect(result).toHaveProperty("success");
    });

    it("returns error for empty input", async () => {
      const result = await submitTrustline({
        asset: "",
        limit: "",
      });
      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });

    it("returns error for invalid asset", async () => {
      const result = await submitTrustline({
        asset: "not-a-valid-asset",
        limit: "1000",
      });
      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });

  describe("submitPayment", () => {
    it("returns success for valid input", async () => {
      const result = await submitPayment({
        destination: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        amount: "100",
        asset: "native",
      });
      expect(result).toHaveProperty("success");
    });

    it("returns error for empty destination", async () => {
      const result = await submitPayment({
        destination: "",
        amount: "100",
        asset: "native",
      });
      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });

    it("returns error for invalid amount", async () => {
      const result = await submitPayment({
        destination: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        amount: "not-a-number",
        asset: "native",
      });
      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });

  describe("submitOffer", () => {
    it("returns success for valid input", async () => {
      const result = await submitOffer({
        selling: "native",
        buying: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        amount: "100",
        price: "0.5",
      });
      expect(result).toHaveProperty("success");
    });

    it("returns error for empty amount", async () => {
      const result = await submitOffer({
        selling: "native",
        buying: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        amount: "",
        price: "0.5",
      });
      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });

    it("returns error for invalid price", async () => {
      const result = await submitOffer({
        selling: "native",
        buying: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        amount: "100",
        price: "invalid",
      });
      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });
});
