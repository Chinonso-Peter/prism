/**
 * Tests for the rate limiter (#102).
 *
 * Covers window reset, 429 response, Retry-After header, and per-scope buckets.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit, type RateLimitResult } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const result = rateLimit("test-scope", 5, 60000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("returns 429 when limit is exceeded", () => {
    const scope = "limit-test";
    const limit = 3;

    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      rateLimit(scope, limit, 60000);
    }

    const result = rateLimit(scope, limit, 60000);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("includes Retry-After header when rate limited", () => {
    const scope = "retry-test";
    const limit = 1;
    const windowMs = 60000;

    rateLimit(scope, limit, windowMs);
    const result = rateLimit(scope, limit, windowMs);

    expect(result.success).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(Math.ceil(windowMs / 1000));
  });

  it("resets the window after the time window elapses", () => {
    const scope = "reset-test";
    const limit = 2;
    const windowMs = 60000;

    // Exhaust the limit
    rateLimit(scope, limit, windowMs);
    rateLimit(scope, limit, windowMs);

    // First call should fail
    expect(rateLimit(scope, limit, windowMs).success).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(windowMs + 1);

    // Should succeed again after window reset
    const result = rateLimit(scope, limit, windowMs);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("maintains separate buckets per scope", () => {
    const scopeA = "scope-a";
    const scopeB = "scope-b";
    const limit = 2;

    // Exhaust scope A
    rateLimit(scopeA, limit, 60000);
    rateLimit(scopeA, limit, 60000);

    // Scope A is exhausted
    expect(rateLimit(scopeA, limit, 60000).success).toBe(false);

    // Scope B should still be available
    const result = rateLimit(scopeB, limit, 60000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });
});
