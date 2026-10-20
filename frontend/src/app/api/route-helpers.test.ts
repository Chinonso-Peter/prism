/**
 * Tests for route handler input validation (#103).
 *
 * Tests each route handler with valid and invalid input, asserting status codes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the data layer
vi.mock("@/lib/indexed-db", () => ({
  getLatestValues: vi.fn(),
  getKeyHistory: vi.fn(),
  getKeysByPrefix: vi.fn(),
}));

import { GET as getLatestValues } from "./api/latest/route";
import { GET as getKeyHistory } from "./api/history/route";
import { POST as postQuery } from "./api/query/route";

describe("Route Handler Input Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/latest", () => {
    it("returns 200 for valid input", async () => {
      const request = new Request("http://localhost/api/latest?network=testnet");
      const response = await getLatestValues(request);
      expect(response.status).toBeLessThan(400);
    });

    it("returns 400 for invalid network", async () => {
      const request = new Request("http://localhost/api/latest?network=invalid");
      const response = await getLatestValues(request);
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/history", () => {
    it("returns 200 for valid input", async () => {
      const request = new Request(
        "http://localhost/api/history?network=testnet&key=test&limit=10"
      );
      const response = await getKeyHistory(request);
      expect(response.status).toBeLessThan(400);
    });

    it("returns 400 for invalid limit", async () => {
      const request = new Request(
        "http://localhost/api/history?network=testnet&key=test&limit=-1"
      );
      const response = await getKeyHistory(request);
      expect(response.status).toBe(400);
    });

    it("returns 400 for limit exceeding maximum", async () => {
      const request = new Request(
        "http://localhost/api/history?network=testnet&key=test&limit=99999"
      );
      const response = await getKeyHistory(request);
      expect(response.status).toBe(400);
    });

    it("returns 400 for missing key", async () => {
      const request = new Request("http://localhost/api/history?network=testnet");
      const response = await getKeyHistory(request);
      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/query", () => {
    it("returns 200 for valid input", async () => {
      const request = new Request("http://localhost/api/query", {
        method: "POST",
        body: JSON.stringify({ network: "testnet", query: { key: "test" } }),
      });
      const response = await postQuery(request);
      expect(response.status).toBeLessThan(400);
    });

    it("returns 400 for empty body", async () => {
      const request = new Request("http://localhost/api/query", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const response = await postQuery(request);
      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid JSON", async () => {
      const request = new Request("http://localhost/api/query", {
        method: "POST",
        body: "not-json",
      });
      const response = await postQuery(request);
      expect(response.status).toBe(400);
    });
  });
});
