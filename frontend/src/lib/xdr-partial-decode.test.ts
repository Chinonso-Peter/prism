import { afterEach, describe, expect, it, vi } from "vitest";
import { Address, xdr } from "@stellar/stellar-sdk";
import { decodeAnyXdr } from "./xdr";

const CONTRACT = "CDPUJYCTPGPEGS6MBXYLEWTYSGCPVKUHCURLF2ORT3RAVL5TF5JKIAI5";

function ledgerEntryXdr(): string {
  return new xdr.LedgerEntry({
    lastModifiedLedgerSeq: 7,
    data: xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: new xdr.ExtensionPoint(0),
        contract: new Address(CONTRACT).toScAddress(),
        key: xdr.ScVal.scvSymbol("Admin"),
        durability: xdr.ContractDataDurability.persistent(),
        val: xdr.ScVal.scvU32(1),
      })
    ),
    ext: new xdr.LedgerEntryExt(0),
  }).toXDR("base64");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("decodeAnyXdr partial decodes", () => {
  it("summarizes every field and is not partial when the contents read cleanly", () => {
    const result = decodeAnyXdr(ledgerEntryXdr());

    expect(result?.type).toBe("LedgerEntry");
    expect(result?.partial).toBe(false);
    expect(result?.fields.map((f) => f.label)).toEqual(["Entry type", "Last modified ledger"]);
  });

  it("flags a recognized type as partial when a field accessor fails", () => {
    const encoded = ledgerEntryXdr();
    vi.spyOn(xdr.LedgerEntry.prototype, "lastModifiedLedgerSeq").mockImplementation(() => {
      throw new Error("forced field failure");
    });

    // The type still round-trips, so it is identified; only its contents are lost.
    expect(decodeAnyXdr(encoded)).toEqual({ type: "LedgerEntry", fields: [], partial: true });
  });
});
