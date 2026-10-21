/**
 * Tests for the rate limiter (#102, #27).
 *
 * Covers window reset, 429 response, Retry-After header, per-scope buckets,
 * and the TRUST_PROXY-controlled X-Forwarded-For behaviour (#27).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit, getClientKey, rateLimitRequest, type RateLimitResult } from "./rate-limit";

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

// Issue #27 — TRUST_PROXY-controlled X-Forwarded-For
describe("getClientKey (#27)", () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });

  function makeReq(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/", { headers });
  }

  it("returns 'direct' when TRUST_PROXY is not set and a spoofed header is present", () => {
    delete process.env.TRUST_PROXY;
    const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
    expect(getClientKey(req)).toBe("direct");
  });

  it("returns 'direct' when TRUST_PROXY=false even with a forwarded header", () => {
    process.env.TRUST_PROXY = "false";
    const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
    expect(getClientKey(req)).toBe("direct");
  });

  it("returns the first forwarded IP when TRUST_PROXY=1", () => {
    process.env.TRUST_PROXY = "1";
    const req = makeReq({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" });
    expect(getClientKey(req)).toBe("5.6.7.8");
  });

  it("returns 'direct' when TRUST_PROXY=1 but the header is absent", () => {
    process.env.TRUST_PROXY = "1";
    expect(getClientKey(makeReq())).toBe("direct");
  });

  it("two requests with different spoofed headers share the same bucket when TRUST_PROXY is off", () => {
    delete process.env.TRUST_PROXY;
    const req1 = makeReq({ "x-forwarded-for": "1.1.1.1" });
    const req2 = makeReq({ "x-forwarded-for": "2.2.2.2" });
    expect(getClientKey(req1)).toBe(getClientKey(req2));
  });
});

describe("rateLimitRequest (#27)", () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
    vi.useRealTimers();
  });

  it("returns null when the request is within the limit", () => {
    const req = new Request("http://localhost/");
    const result = rateLimitRequest(req, { scope: "test-http", max: 5 });
    expect(result).toBeNull();
  });

  it("returns a 429 NextResponse when the limit is exceeded", () => {
    vi.useFakeTimers();
    const req = new Request("http://localhost/");
    // Exhaust the bucket (scope must be unique to this test)
    for (let i = 0; i < 2; i++) rateLimitRequest(req, { scope: "test-http-429", max: 2 });
    const result = rateLimitRequest(req, { scope: "test-http-429", max: 2 });
    expect(result?.status).toBe(429);
  });
});
