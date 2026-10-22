import { describe, expect, it } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { extractInvocationReturnValue, scValToDisplay } from "./decode.js";

describe("scValToDisplay", () => {
  it("decodes a symbol to a plain string", () => {
    expect(scValToDisplay(xdr.ScVal.scvSymbol("Admin"))).toBe("Admin");
  });

  it("renders void as the literal string 'void'", () => {
    expect(scValToDisplay(xdr.ScVal.scvVoid())).toBe("void");
  });

  it("renders a vec as JSON", () => {
    const vec = xdr.ScVal.scvVec([xdr.ScVal.scvU32(1), xdr.ScVal.scvU32(2)]);
    expect(scValToDisplay(vec)).toBe("[1,2]");
  });

  it("decodes a u128 to a string (bigints aren't JSON-safe)", () => {
    const val = xdr.ScVal.scvU128(
      new xdr.UInt128Parts({ hi: xdr.Uint64.fromString("0"), lo: xdr.Uint64.fromString("1000") })
    );
    expect(scValToDisplay(val)).toBe("1000");
  });

  it("doesn't dump the raw internal struct for a contract instance value", () => {
    // Would previously fall through to JSON.stringify(scValToNative(...)) and
    // print the js-xdr class's internal fields (_maxDepth, _attributes, ...).
    const instance = new xdr.ScContractInstance({
      executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32)),
      storage: null,
    });
    const val = xdr.ScVal.scvContractInstance(instance);
    expect(scValToDisplay(val)).toBe("(contract instance)");
  });
});

describe("extractInvocationReturnValue", () => {
  it.each([3, 4])("reads a successful Soroban return value from metadata v%s", (version) => {
    const returnValue = xdr.ScVal.scvSymbol("result");
    const ext = new xdr.SorobanTransactionMetaExt(0);
    const transactionMeta =
      version === 3
        ? new xdr.TransactionMeta(
            3,
            new xdr.TransactionMetaV3({
              ext: new xdr.ExtensionPoint(0),
              txChangesBefore: [],
              operations: [],
              txChangesAfter: [],
              sorobanMeta: new xdr.SorobanTransactionMeta({
                ext,
                events: [],
                returnValue,
                diagnosticEvents: [],
              }),
            })
          )
        : new xdr.TransactionMeta(
            4,
            new xdr.TransactionMetaV4({
              ext: new xdr.ExtensionPoint(0),
              txChangesBefore: [],
              operations: [],
              txChangesAfter: [],
              sorobanMeta: new xdr.SorobanTransactionMetaV2({ ext, returnValue }),
              events: [],
              diagnosticEvents: [],
            })
          );

    expect(extractInvocationReturnValue(transactionMeta)).toBe("result");
  });
});
