import { describe, expect, it } from "vitest";
import { describeContractError } from "./contract-error";
import type { ContractTypeDef } from "@/types";

/** Mirrors the error enum in contracts/showcase. */
const types: ContractTypeDef[] = [
  { kind: "struct", name: "Note", fields: [{ name: "revision", type: "U32" }] },
  {
    kind: "error",
    name: "Error",
    doc: "Everything showcase can refuse to do.",
    cases: [
      { name: "AlreadyInitialized", value: 1 },
      { name: "NotInitialized", value: 2 },
      { name: "NoteTooLong", value: 3 },
      { name: "NoSuchNote", value: 4 },
      { name: "Deliberate", value: 5 },
    ],
  },
];

describe("describeContractError", () => {
  it("names a contract error code from the ABI", () => {
    const result = describeContractError(
      "HostError: Error(Contract, #3)\n\nEvent log: ...",
      types
    );
    expect(result).toMatchObject({ name: "Error::NoteTooLong", code: 3 });
  });

  it("carries the enum's doc comment through", () => {
    expect(describeContractError("Error(Contract, #5)", types)?.doc).toBe(
      "Everything showcase can refuse to do."
    );
  });

  it("tolerates the spacing variations in host messages", () => {
    expect(describeContractError("Error(Contract,#1)", types)?.name).toBe(
      "Error::AlreadyInitialized"
    );
  });

  it("returns null for a code the enum doesn't declare", () => {
    expect(describeContractError("Error(Contract, #99)", types)).toBeNull();
  });

  it("ignores the host's own error types, which aren't the contract's", () => {
    // Storage/Budget/WasmVm codes come from the host and have no relationship
    // to the contract's enum — naming one from it would be a fabrication.
    expect(describeContractError("Error(Storage, #3)", types)).toBeNull();
    expect(describeContractError("Error(Budget, #3)", types)).toBeNull();
  });

  it("returns null when the message carries no error code", () => {
    expect(describeContractError("simulation timed out", types)).toBeNull();
  });

  it("returns null when the contract declares no error enum", () => {
    const noErrors: ContractTypeDef[] = [
      { kind: "struct", name: "Note", fields: [] },
    ];
    expect(describeContractError("Error(Contract, #3)", noErrors)).toBeNull();
    expect(describeContractError("Error(Contract, #3)", [])).toBeNull();
  });
});
