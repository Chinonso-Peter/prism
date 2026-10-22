import { describe, expect, it } from "vitest";
import { backoffDelay, healthReport } from "./index.js";

describe("backoffDelay", () => {
  it("doubles the delay for each consecutive failure", () => {
    const upperBound = (failures: number) => backoffDelay(failures, () => 1);
    expect([1, 2, 3, 4].map(upperBound)).toEqual([1000, 2000, 4000, 8000]);
  });

  it("never lets a later failure wait less than an earlier one could, until the cap", () => {
    // Failure 7 onward hits the 60s cap, so the ranges overlap from there on.
    for (let failures = 2; failures <= 6; failures++) {
      const shortest = backoffDelay(failures, () => 0);
      const longestBefore = backoffDelay(failures - 1, () => 1);
      expect(shortest).toBeGreaterThanOrEqual(longestBefore);
    }
  });

  it("caps the delay at the maximum", () => {
    expect(backoffDelay(50, () => 1)).toBe(60_000);
    expect(backoffDelay(50, () => 0)).toBe(30_000);
  });
});

describe("healthReport", () => {
  const base = { cursor: 100, latestLedger: 102, lastPollFailed: false };

  it("is healthy when the cursor is within the lag threshold", () => {
    expect(healthReport(base, 60)).toEqual({ healthy: true, ...base, lag: 2 });
  });

  it("is unhealthy when the lag passes the threshold", () => {
    expect(healthReport({ ...base, latestLedger: 161 }, 60)).toMatchObject({ healthy: false, lag: 61 });
    expect(healthReport({ ...base, latestLedger: 160 }, 60)).toMatchObject({ healthy: true, lag: 60 });
  });

  it("is unhealthy when the last poll failed", () => {
    expect(healthReport({ ...base, lastPollFailed: true }, 60)).toMatchObject({ healthy: false });
  });

  it("never reports a negative lag", () => {
    expect(healthReport({ ...base, latestLedger: 90 }, 60)).toMatchObject({ healthy: true, lag: 0 });
  });
});
