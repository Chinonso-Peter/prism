import { describe, expect, it } from "vitest";
import {
  Account,
  Asset,
  Contract,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { decodeInvocation, decodeInvocations } from "./xdr";

const firstContract = StrKey.encodeContract(Buffer.alloc(32, 1));
const secondContract = StrKey.encodeContract(Buffer.alloc(32, 2));

function envelopeWith(...operations: xdr.Operation[]): xdr.TransactionEnvelope {
  const source = new Account(Keypair.random().publicKey(), "1");
  const builder = new TransactionBuilder(source, { fee: "100", networkPassphrase: Networks.TESTNET });
  for (const op of operations) builder.addOperation(op);
  return builder.setTimeout(30).build().toEnvelope();
}

describe("decodeInvocations", () => {
  it("decodes every contract call, tagged with its operation index", () => {
    const envelope = envelopeWith(
      new Contract(firstContract).call("transfer"),
      new Contract(secondContract).call("mint")
    );

    expect(decodeInvocations(envelope)).toEqual([
      { operationIndex: 0, contractId: firstContract, functionName: "transfer", args: [] },
      { operationIndex: 1, contractId: secondContract, functionName: "mint", args: [] },
    ]);
  });

  it("skips operations that are not contract calls, keeping their indices", () => {
    const envelope = envelopeWith(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: "1",
      }),
      new Contract(secondContract).call("mint")
    );

    expect(decodeInvocations(envelope)).toEqual([
      { operationIndex: 1, contractId: secondContract, functionName: "mint", args: [] },
    ]);
  });

  it("returns nothing when the transaction makes no contract call", () => {
    const envelope = envelopeWith(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: "1",
      })
    );

    expect(decodeInvocations(envelope)).toEqual([]);
  });
});

describe("decodeInvocation", () => {
  it("returns the first contract call", () => {
    const envelope = envelopeWith(
      new Contract(firstContract).call("transfer"),
      new Contract(secondContract).call("mint")
    );

    expect(decodeInvocation(envelope)?.contractId).toBe(firstContract);
  });
});
