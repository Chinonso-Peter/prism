import { describe, expect, it } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { parseContractEvents, parseContractSpec, parseContractTypes } from "./xdr";

// Fixed seeds, so a failure reproduces exactly. Add a seed rather than
// randomizing, which would make a CI failure impossible to replay.
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

/** A small deterministic PRNG (mulberry32), returning values in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function leb128(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return Buffer.from(bytes);
}

/** A WASM module whose "contractspecv0" section declares a function, a struct and an event. */
function validModule(): Buffer {
  const entries = [
    xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: "",
        name: "transfer",
        inputs: [
          new xdr.ScSpecFunctionInputV0({
            doc: "",
            name: "amount",
            type: xdr.ScSpecTypeDef.scSpecTypeU32(),
          }),
        ],
        outputs: [xdr.ScSpecTypeDef.scSpecTypeBool()],
      })
    ),
    xdr.ScSpecEntry.scSpecEntryUdtStructV0(
      new xdr.ScSpecUdtStructV0({
        doc: "",
        lib: "",
        name: "Note",
        fields: [
          new xdr.ScSpecUdtStructFieldV0({
            doc: "",
            name: "revision",
            type: xdr.ScSpecTypeDef.scSpecTypeU32(),
          }),
        ],
      })
    ),
    xdr.ScSpecEntry.scSpecEntryEventV0(
      new xdr.ScSpecEventV0({
        doc: "",
        lib: "",
        name: "Bumped",
        prefixTopics: ["bumped"],
        params: [
          new xdr.ScSpecEventParamV0({
            doc: "",
            name: "counter",
            type: xdr.ScSpecTypeDef.scSpecTypeU32(),
            location: xdr.ScSpecEventParamLocationV0.scSpecEventParamLocationData(),
          }),
        ],
        dataFormat: xdr.ScSpecEventDataFormat.scSpecEventDataFormatSingleValue(),
      })
    ),
  ];

  const name = Buffer.from("contractspecv0");
  const body = Buffer.concat([
    leb128(name.length),
    name,
    ...entries.map((entry) => Buffer.from(entry.toXDR())),
  ]);
  return Buffer.concat([
    Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]), // magic + version
    Buffer.from([0x00]), // custom section id
    leb128(body.length),
    body,
  ]);
}

function expectNothingDeclared(wasm: Buffer) {
  expect(parseContractSpec(wasm)).toEqual([]);
  expect(parseContractTypes(wasm)).toEqual([]);
  expect(parseContractEvents(wasm)).toEqual([]);
}

describe("WASM spec parsers on a valid module", () => {
  it("reads every declared entry, so the fuzz cases below start from real content", () => {
    const wasm = validModule();

    expect(parseContractSpec(wasm).map((f) => f.name)).toEqual(["transfer"]);
    expect(parseContractTypes(wasm).map((t) => t.name)).toEqual(["Note"]);
    expect(parseContractEvents(wasm).map((e) => e.name)).toEqual(["Bumped"]);
  });
});

describe("WASM spec parsers on malformed modules", () => {
  const valid = validModule();

  it("returns nothing for every truncation of a valid module", () => {
    // The custom section's length prefix no longer matches once any tail is
    // cut, so every shorter prefix is an invalid module and must parse as empty.
    for (let length = 0; length < valid.length; length++) {
      expectNothingDeclared(valid.subarray(0, length));
    }
  });

  it.each(SEEDS)("does not throw on a module with flipped bytes (seed %i)", (seed) => {
    const random = mulberry32(seed);
    const corrupted = Buffer.from(valid);
    for (let flip = 0; flip < 4; flip++) {
      const offset = Math.floor(random() * corrupted.length);
      // XOR with a non-zero value so every flip really changes the byte.
      corrupted[offset] ^= 1 + Math.floor(random() * 255);
    }

    expect(() => parseContractSpec(corrupted)).not.toThrow();
    expect(() => parseContractTypes(corrupted)).not.toThrow();
    expect(() => parseContractEvents(corrupted)).not.toThrow();
    expect(Array.isArray(parseContractSpec(corrupted))).toBe(true);
    expect(Array.isArray(parseContractTypes(corrupted))).toBe(true);
    expect(Array.isArray(parseContractEvents(corrupted))).toBe(true);
  });
});
