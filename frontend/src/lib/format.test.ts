import { describe, expect, it } from "vitest";
import { balanceLabel, shortHash, stroopsToXlm, formatFee, formatNumber, timeAgo, formatContractId } from "./format";

describe("shortHash", () => {
  it("truncates long hashes with an ellipsis", () => {
    const hash = "a".repeat(64);
    expect(shortHash(hash)).toBe("aaaaaa...aaaaaa");
  });

  it("leaves short strings untouched", () => {
    expect(shortHash("short")).toBe("short");
  });

  it("respects a custom character count", () => {
    const hash = "CDPUJYCTPGPEGS6MBXYLEWTYSGCPVKUHCURLF2ORT3RAVL5TF5JKIAI5";
    expect(shortHash(hash, 4)).toBe("CDPU...IAI5");
  });
});

describe("formatContractId", () => {
  it("shortens using 8 leading/trailing characters", () => {
    const id = "CDPUJYCTPGPEGS6MBXYLEWTYSGCPVKUHCURLF2ORT3RAVL5TF5JKIAI5";
    expect(formatContractId(id)).toBe(`${id.slice(0, 8)}...${id.slice(-8)}`);
  });
});

describe("stroopsToXlm", () => {
  it("converts stroops to XLM with 7 decimal places", () => {
    expect(stroopsToXlm(10_000_000)).toBe("1.0000000 XLM");
    expect(stroopsToXlm(1)).toBe("0.0000001 XLM");
    expect(stroopsToXlm(0)).toBe("0.0000000 XLM");
  });
});

describe("formatFee", () => {
  it("adds thousands separators and a stroops suffix", () => {
    expect(formatFee(1234567)).toBe("1,234,567 stroops");
  });
});

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(4064026)).toBe("4,064,026");
    expect(formatNumber(0)).toBe("0");
  });
});

describe("timeAgo", () => {
  it("reports seconds for very recent timestamps", () => {
    const now = new Date();
    expect(timeAgo(new Date(now.getTime() - 5000).toISOString())).toMatch(/^\ds ago$/);
  });

  it("reports minutes for timestamps under an hour old", () => {
    const now = new Date();
    expect(timeAgo(new Date(now.getTime() - 5 * 60_000).toISOString())).toBe("5m ago");
  });

  it("reports hours for timestamps under a day old", () => {
    const now = new Date();
    expect(timeAgo(new Date(now.getTime() - 3 * 3_600_000).toISOString())).toBe("3h ago");
  });

  it("reports days for older timestamps", () => {
    const now = new Date();
    expect(timeAgo(new Date(now.getTime() - 2 * 86_400_000).toISOString())).toBe("2d ago");
  });
});

describe("balanceLabel", () => {
  it("labels native XLM", () => {
    expect(balanceLabel({ assetType: "native", balance: "10.0000000" })).toBe("XLM");
  });

  it("labels a credit asset with its code and shortened issuer", () => {
    const issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    expect(
      balanceLabel({ assetType: "credit_alphanum4", assetCode: "USDC", assetIssuer: issuer, balance: "1" })
    ).toBe(`USDC:${issuer.slice(0, 4)}...${issuer.slice(-4)}`);
  });

  it("labels liquidity pool shares with a shortened pool ID, not 'undefined'", () => {
    const poolId = "dd7b1ab831c273310ddbec6f97870aa83c2fbd78ce22aded37ecbf4f3380fac7";
    const label = balanceLabel({
      assetType: "liquidity_pool_shares",
      liquidityPoolId: poolId,
      balance: "5",
    });
    expect(label).toBe(`Pool ${poolId.slice(0, 6)}...${poolId.slice(-6)}`);
    expect(label).not.toContain("undefined");
  });

  it("falls back to the asset type when there is no code or pool ID", () => {
    expect(balanceLabel({ assetType: "liquidity_pool_shares", balance: "5" })).toBe("liquidity_pool_shares");
  });
});
