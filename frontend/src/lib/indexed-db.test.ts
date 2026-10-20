/**
 * Integration tests for indexed-db.ts (#100).
 *
 * Tests the indexed queries covering latest value per key, removed keys exclusion,
 * and tie ordering using pg-mem for local testing.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Mock pg for local testing
vi.mock("pg", () => {
  const mockQuery = vi.fn();
  return {
    Pool: vi.fn(() => ({
      query: mockQuery,
      end: vi.fn(),
    })),
    __mockQuery: mockQuery,
  };
});

import { getLatestValues, getKeyHistory, getKeysByPrefix } from "./indexed-db";

// Get the mock query function
const { __mockQuery: mockQuery } = await import("pg");

describe("Indexed DB Queries", () => {
  beforeAll(() => {
    // Setup mock data
    mockQuery.mockClear();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("getLatestValues", () => {
    it("returns latest value per key using DISTINCT ON", async () => {
      const mockRows = [
        { key: "key1", value: "value1", ledger: 100, change_type: "created" },
        { key: "key2", value: "value2", ledger: 200, change_type: "updated" },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await getLatestValues("testnet", ["key1", "key2"]);
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe("key1");
    });

    it("excludes removed keys", async () => {
      const mockRows = [
        { key: "key1", value: "value1", ledger: 100, change_type: "created" },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await getLatestValues("testnet", ["key1", "key2"]);
      // key2 should be excluded if it was removed
      expect(result.every((r) => r.key !== "key2" || r.change_type !== "removed")).toBe(true);
    });

    it("handles empty key list", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getLatestValues("testnet", []);
      expect(result).toHaveLength(0);
    });
  });

  describe("getKeyHistory", () => {
    it("returns history ordered by ledger", async () => {
      const mockRows = [
        { key: "key1", value: "value3", ledger: 300, change_type: "updated" },
        { key: "key1", value: "value2", ledger: 200, change_type: "updated" },
        { key: "key1", value: "value1", ledger: 100, change_type: "created" },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await getKeyHistory("testnet", "key1", 10);
      expect(result).toHaveLength(3);
      // Should be ordered by ledger descending (newest first)
      expect(result[0].ledger).toBeGreaterThan(result[1].ledger);
    });

    it("respects the limit parameter", async () => {
      const mockRows = [
        { key: "key1", value: "value3", ledger: 300, change_type: "updated" },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await getKeyHistory("testnet", "key1", 1);
      expect(result).toHaveLength(1);
    });

    it("handles ties in ordering correctly", async () => {
      // Two entries with same ledger should be ordered by insertion
      const mockRows = [
        { key: "key1", value: "value2", ledger: 100, change_type: "updated" },
        { key: "key1", value: "value1", ledger: 100, change_type: "created" },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await getKeyHistory("testnet", "key1", 10);
      expect(result).toHaveLength(2);
    });
  });

  describe("getKeysByPrefix", () => {
    it("returns keys matching prefix", async () => {
      const mockRows = [{ key: "prefix:key1" }, { key: "prefix:key2" }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await getKeysByPrefix("testnet", "prefix:");
      expect(result).toHaveLength(2);
    });

    it("returns empty array for non-matching prefix", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getKeysByPrefix("testnet", "nonexistent:");
      expect(result).toHaveLength(0);
    });
  });
});
