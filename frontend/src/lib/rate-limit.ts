import { NextResponse } from "next/server";

const WINDOW_MS = 60_000;
const DEFAULT_MAX_PER_WINDOW = 30;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-memory, per-process fixed-window limiter. Good enough to stop a single
 * client from hammering the public Horizon/Soroban RPC nodes through this
 * API — NOT distributed, so it resets per instance on a multi-instance
 * deployment. A real deployment behind a shared cache (Redis, etc.) would
 * need a proper distributed limiter instead. Buckets are keyed by
 * `${scope}:${clientKey}` so different routes can carry independent limits.
 */
const buckets = new Map<string, Bucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 5 * 60_000).unref?.();

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Seconds until the window resets. Only set when success is false. */
  retryAfter?: number;
}

/**
 * Core bucket logic — keyed by an arbitrary string that callers compose.
 * Returns a structured result rather than a NextResponse so it can be used
 * in non-HTTP contexts (tests, background workers, etc.).
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: max - 1 };
  }

  if (bucket.count >= max) {
    return {
      success: false,
      remaining: 0,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { success: true, remaining: max - bucket.count };
}

/**
 * Derive a stable client key from an HTTP request.
 *
 * `X-Forwarded-For` is a client-controlled header; any value it carries is
 * only trustworthy when a known, trusted reverse proxy set it. The
 * `TRUST_PROXY` environment variable opts in to that trust:
 *
 *   - `TRUST_PROXY=1` (or any non-empty, non-"false" string): use the first
 *     value from `X-Forwarded-For`. Set this only when a trusted proxy sits
 *     in front of this server and strips or rewrites the header itself.
 *   - `TRUST_PROXY` unset or `"false"` (the default): ignore the header.
 *     All requests share the key `"direct"` because the App Router does not
 *     expose the raw socket address. Deploy behind a trusted proxy and set
 *     `TRUST_PROXY=1` to get per-IP bucketing in production.
 */
export function getClientKey(req: Request): string {
  const trustProxy =
    process.env.TRUST_PROXY !== undefined &&
    process.env.TRUST_PROXY !== "" &&
    process.env.TRUST_PROXY !== "false";

  if (trustProxy) {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim();
    if (ip) return ip;
  }

  // Without a trusted proxy the socket address is unavailable in App Router.
  // Fall back to a single shared key rather than silently trusting a spoofed
  // header — the per-scope limit still applies, just not per-IP.
  return "direct";
}

/**
 * HTTP-level helper: returns a 429 NextResponse if the caller is over the
 * limit, or null if the request should proceed.
 */
export function rateLimitRequest(
  req: Request,
  opts?: { scope?: string; max?: number }
): NextResponse | null {
  const max = opts?.max ?? DEFAULT_MAX_PER_WINDOW;
  const key = `${opts?.scope ?? "default"}:${getClientKey(req)}`;
  const result = rateLimit(key, max, WINDOW_MS);

  if (!result.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfter ?? 60) },
      }
    );
  }

  return null;
}
