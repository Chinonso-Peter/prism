import { describe, expect, it } from "vitest";
import {
  xdr,
  Account,
  Address,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  decodeScVal,
  scValToDisplay,
  decodeXdr,
  decodeScValXdr,
  coerceArgInput,
  parseContractSpec,
  identifyXdr,
  decodeAnyXdr,
  parseContractEvents,
  base64FromQueryParam,
  type ParsedEventSpec,
} from "./xdr";
import { labelEventData, labelEventTopics, matchEventSpec } from "./event-spec";

describe("decodeScVal / scValToDisplay", () => {
  it("decodes a u32", () => {
    expect(decodeScVal(xdr.ScVal.scvU32(42))).toBe(42);
  });

  it("decodes a symbol to a string", () => {
    expect(decodeScVal(xdr.ScVal.scvSymbol("hello"))).toBe("hello");
  });

  it("decodes a u128 to a string (bigints aren't JSON-safe)", () => {
    const decoded = decodeScVal(xdr.ScVal.scvU128(new xdr.UInt128Parts({ hi: xdr.Uint64.fromString("0"), lo: xdr.Uint64.fromString("1000") })));
    expect(decoded).toBe("1000");
  });

  it("renders void as the literal string 'void'", () => {
    expect(scValToDisplay(xdr.ScVal.scvVoid())).toBe("void");
  });

  it("renders a scalar as a plain string, not JSON-quoted", () => {
    expect(scValToDisplay(xdr.ScVal.scvSymbol("admin"))).toBe("admin");
  });

  it("renders a vec as JSON", () => {
    const vec = xdr.ScVal.scvVec([xdr.ScVal.scvU32(1), xdr.ScVal.scvU32(2)]);
    expect(scValToDisplay(vec)).toBe("[1,2]");
  });
});

describe("decodeXdr / decodeScValXdr (base64 round-trip)", () => {
  it("round-trips a symbol through base64 XDR", () => {
    const base64 = xdr.ScVal.scvSymbol("counter").toXDR("base64");
    expect(decodeXdr(base64)).toBe("counter");
    expect(decodeScValXdr(base64)).toBe("counter");
  });

  it("falls back to the raw input on invalid base64 XDR", () => {
    expect(decodeXdr("not valid xdr")).toBe("not valid xdr");
    expect(decodeScValXdr("not valid xdr")).toBeUndefined();
  });
});

describe("coerceArgInput", () => {
  it("coerces scalar types to the matching ScVal variant", () => {
    expect(coerceArgInput("42", "U32").switch().name).toBe("scvU32");
    expect(coerceArgInput("42", "I64").switch().name).toBe("scvI64");
    expect(coerceArgInput("hello", "Symbol").switch().name).toBe("scvSymbol");
    expect(coerceArgInput("true", "Bool").switch().name).toBe("scvBool");
    expect(coerceArgInput("true", "Bool").b()).toBe(true);
  });

  it("coerces a valid account address", () => {
    const address = Keypair.random().publicKey();
    const scval = coerceArgInput(address, "Address");
    expect(scval.switch().name).toBe("scvAddress");
    expect(Address.fromScAddress(scval.address()).toString()).toBe(address);
  });

  it("falls back to best-effort JSON parsing for unknown/compound types", () => {
    const scval = coerceArgInput('{"a":1}', "SomeUdtType");
    expect(scval.switch().name).toBe("scvMap");
  });
});

describe("parseContractSpec", () => {
  it("returns an empty array for a WASM binary with no contract spec section", () => {
    // Smallest valid WASM module: magic number + version, no sections.
    const emptyModule = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    expect(parseContractSpec(emptyModule)).toEqual([]);
  });

  it("returns an empty array (not a throw) for invalid input", () => {
    expect(parseContractSpec(Buffer.from("not wasm"))).toEqual([]);
  });
});

function buildEnvelope(source: Keypair) {
  return new TransactionBuilder(new Account(source.publicKey(), "42"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: "100" }))
    .addMemo(Memo.text("prism"))
    .setTimeout(30)
    .build();
}

/**
 * A v0 transaction envelope — the pre-Protocol-13 shape, still all over the
 * chain's history. It carries a bare ed25519 key rather than a muxed account,
 * which is the part that used to make the decoder throw.
 */
function buildV0Envelope(source: Keypair) {
  const tx = new xdr.TransactionV0({
    sourceAccountEd25519: StrKey.decodeEd25519PublicKey(source.publicKey()),
    fee: 100,
    // SequenceNumber is a typedef of Int64; only the latter is in the .d.ts.
    seqNum: xdr.Int64.fromString("43"),
    timeBounds: null,
    memo: xdr.Memo.memoText(Buffer.from("prism")),
    operations: [Operation.bumpSequence({ bumpTo: "100" })],
    ext: new xdr.TransactionV0Ext(0),
  });
  return xdr.TransactionEnvelope.envelopeTypeTxV0(
    new xdr.TransactionV0Envelope({ tx, signatures: [] })
  );
}

describe("identifyXdr", () => {
  it("identifies a transaction envelope", () => {
    const envelope = buildEnvelope(Keypair.random()).toXDR();
    expect(identifyXdr(envelope)).toBe("TransactionEnvelope");
  });

  it("identifies a bare ScVal", () => {
    expect(identifyXdr(xdr.ScVal.scvSymbol("counter").toXDR("base64"))).toBe("ScVal");
  });

  it("identifies a ledger key", () => {
    const key = xdr.LedgerKey.contractCode(
      new xdr.LedgerKeyContractCode({ hash: Buffer.alloc(32, 7) })
    );
    expect(identifyXdr(key.toXDR("base64"))).toBe("LedgerKey");
  });

  it("tolerates whitespace and newlines from a copy-paste", () => {
    const base64 = xdr.ScVal.scvU32(7).toXDR("base64");
    expect(identifyXdr(` ${base64.slice(0, 4)}\n${base64.slice(4)} `)).toBe("ScVal");
  });

  it("returns null for input that isn't XDR at all", () => {
    expect(identifyXdr("not valid xdr")).toBeNull();
    expect(identifyXdr("")).toBeNull();
  });

  it("rejects a truncated blob rather than matching a prefix", () => {
    const envelope = buildEnvelope(Keypair.random()).toXDR();
    const truncated = Buffer.from(envelope, "base64").subarray(0, 20).toString("base64");
    expect(identifyXdr(truncated)).not.toBe("TransactionEnvelope");
  });
});

describe("decodeAnyXdr", () => {
  it("summarizes a transaction envelope", () => {
    const source = Keypair.random();
    const result = decodeAnyXdr(buildEnvelope(source).toXDR());

    expect(result?.type).toBe("TransactionEnvelope");
    const fields = Object.fromEntries(result!.fields.map((f) => [f.label, f.value]));
    expect(fields["Source account"]).toBe(source.publicKey());
    expect(fields["Fee"]).toBe("100 stroops");
    expect(fields["Sequence"]).toBe("43");
    expect(fields["Memo"]).toBe("text: prism");
    expect(fields["Operations"]).toBe("bumpSequence");
  });

  it("summarizes an ScVal", () => {
    const result = decodeAnyXdr(xdr.ScVal.scvU32(99).toXDR("base64"));

    expect(result?.type).toBe("ScVal");
    const fields = Object.fromEntries(result!.fields.map((f) => [f.label, f.value]));
    expect(fields["ScVal type"]).toBe("scvU32");
    expect(fields["Value"]).toBe("99");
  });

  it("summarizes a contract data ledger key", () => {
    const contract = "CDPUJYCTPGPEGS6MBXYLEWTYSGCPVKUHCURLF2ORT3RAVL5TF5JKIAI5";
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(contract).toScAddress(),
        key: xdr.ScVal.scvSymbol("Admin"),
        durability: xdr.ContractDataDurability.persistent(),
      })
    );

    const result = decodeAnyXdr(key.toXDR("base64"));
    expect(result?.type).toBe("LedgerKey");
    const fields = Object.fromEntries(result!.fields.map((f) => [f.label, f.value]));
    expect(fields["Contract"]).toBe(contract);
    expect(fields["Storage key"]).toBe("Admin");
    expect(fields["Durability"]).toBe("persistent");
  });

  it("summarizes a v0 envelope, which carries a bare key instead of a muxed account", () => {
    const source = Keypair.random();
    const result = decodeAnyXdr(buildV0Envelope(source).toXDR("base64"));

    expect(result?.type).toBe("TransactionEnvelope");
    const fields = Object.fromEntries(result!.fields.map((f) => [f.label, f.value]));
    expect(fields["Envelope type"]).toBe("envelopeTypeTxV0");
    expect(fields["Source account"]).toBe(source.publicKey());
    expect(fields["Fee"]).toBe("100 stroops");
    expect(fields["Sequence"]).toBe("43");
    expect(fields["Memo"]).toBe("text: prism");
    expect(fields["Operations"]).toBe("bumpSequence");
  });

  it("returns null for input that isn't XDR", () => {
    expect(decodeAnyXdr("not valid xdr")).toBeNull();
  });
});

/** Unsigned LEB128, the length encoding WASM section headers use. */
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

/**
 * Build a minimal WASM module carrying the given spec entries in a
 * "contractspecv0" custom section — the same shape soroban-sdk emits, without
 * needing a Rust toolchain to produce one.
 */
function wasmWithSpec(entries: xdr.ScSpecEntry[]): Buffer {
  const name = Buffer.from("contractspecv0");
  const body = Buffer.concat([
    leb128(name.length),
    name,
    ...entries.map((e) => Buffer.from(e.toXDR())),
  ]);
  return Buffer.concat([
    Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]), // magic + version
    Buffer.from([0x00]), // custom section id
    leb128(body.length),
    body,
  ]);
}

function eventParam(
  name: string,
  type: xdr.ScSpecTypeDef,
  location: "topic" | "data"
): xdr.ScSpecEventParamV0 {
  return new xdr.ScSpecEventParamV0({
    doc: "",
    name,
    type,
    location:
      location === "topic"
        ? xdr.ScSpecEventParamLocationV0.scSpecEventParamLocationTopicList()
        : xdr.ScSpecEventParamLocationV0.scSpecEventParamLocationData(),
  });
}

/** Mirrors the showcase contract's NoteWritten event. */
function noteWrittenEntry(): xdr.ScSpecEntry {
  return xdr.ScSpecEntry.scSpecEntryEventV0(
    new xdr.ScSpecEventV0({
      doc: "Two indexed topics plus data.",
      lib: "",
      name: "NoteWritten",
      prefixTopics: ["note_written"],
      params: [
        eventParam("name", xdr.ScSpecTypeDef.scSpecTypeSymbol(), "topic"),
        eventParam("author", xdr.ScSpecTypeDef.scSpecTypeAddress(), "topic"),
        eventParam("revision", xdr.ScSpecTypeDef.scSpecTypeU32(), "data"),
      ],
      dataFormat: xdr.ScSpecEventDataFormat.scSpecEventDataFormatMap(),
    })
  );
}

/**
 * Modelled on the showcase contract's Bumped event — no indexed fields — but
 * declared single-value rather than the default map, to cover that mapping.
 */
function bumpedEntry(): xdr.ScSpecEntry {
  return xdr.ScSpecEntry.scSpecEntryEventV0(
    new xdr.ScSpecEventV0({
      doc: "",
      lib: "",
      name: "Bumped",
      prefixTopics: ["bumped"],
      params: [eventParam("counter", xdr.ScSpecTypeDef.scSpecTypeU32(), "data")],
      dataFormat: xdr.ScSpecEventDataFormat.scSpecEventDataFormatSingleValue(),
    })
  );
}

describe("parseContractEvents", () => {
  it("parses a declared event's name, topics, params and data format", () => {
    const [event] = parseContractEvents(wasmWithSpec([noteWrittenEntry()]));

    expect(event.name).toBe("NoteWritten");
    expect(event.prefixTopics).toEqual(["note_written"]);
    expect(event.dataFormat).toBe("map");
    expect(event.doc).toBe("Two indexed topics plus data.");
    expect(event.params).toEqual([
      { name: "name", type: "Symbol", location: "topic" },
      { name: "author", type: "Address", location: "topic" },
      { name: "revision", type: "U32", location: "data" },
    ]);
  });

  it("distinguishes the data formats", () => {
    const [event] = parseContractEvents(wasmWithSpec([bumpedEntry()]));
    expect(event.dataFormat).toBe("single-value");
    expect(event.params.every((p) => p.location === "data")).toBe(true);
  });

  it("omits an absent doc comment rather than reporting an empty string", () => {
    const [event] = parseContractEvents(wasmWithSpec([bumpedEntry()]));
    expect(event.doc).toBeUndefined();
  });

  it("reads events and functions from the same spec section", () => {
    const wasm = wasmWithSpec([noteWrittenEntry(), bumpedEntry()]);
    expect(parseContractEvents(wasm).map((e) => e.name)).toEqual(["NoteWritten", "Bumped"]);
    // Function parsing must ignore the event entries, not choke on them.
    expect(parseContractSpec(wasm)).toEqual([]);
  });

  it("returns an empty array for a contract with no spec section", () => {
    const emptyModule = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    expect(parseContractEvents(emptyModule)).toEqual([]);
    expect(parseContractEvents(Buffer.from("not wasm"))).toEqual([]);
  });
});

describe("matchEventSpec / labelEventTopics", () => {
  const specs: ParsedEventSpec[] = [
    {
      name: "NoteWritten",
      prefixTopics: ["note_written"],
      params: [
        { name: "name", type: "Symbol", location: "topic" },
        { name: "author", type: "Address", location: "topic" },
        { name: "revision", type: "U32", location: "data" },
      ],
      dataFormat: "map",
    },
    {
      name: "Bumped",
      prefixTopics: ["bumped"],
      params: [{ name: "counter", type: "U32", location: "data" }],
      dataFormat: "single-value",
    },
  ];

  it("matches an emitted event to its declaration by prefix topic", () => {
    const match = matchEventSpec(["note_written", "hello", "GABC"], specs);
    expect(match?.name).toBe("NoteWritten");
  });

  it("matches an event that carries only its name topic", () => {
    expect(matchEventSpec(["bumped"], specs)?.name).toBe("Bumped");
  });

  it("returns undefined for an event the contract never declared", () => {
    expect(matchEventSpec(["transfer", "GABC"], specs)).toBeUndefined();
    expect(matchEventSpec([], specs)).toBeUndefined();
  });

  it("rejects a topic count that doesn't match the declaration", () => {
    // Right prefix, wrong arity — a different event, not this one.
    expect(matchEventSpec(["note_written", "hello"], specs)).toBeUndefined();
    expect(matchEventSpec(["note_written", "hello", "GABC", "extra"], specs)).toBeUndefined();
  });

  it("labels the topics that vary, dropping the event's name topic", () => {
    expect(labelEventTopics(["note_written", "hello", "GABC"], specs[0])).toEqual([
      { name: "name", type: "Symbol", value: "hello" },
      { name: "author", type: "Address", value: "GABC" },
    ]);
  });

  it("labels nothing for an event with no indexed fields", () => {
    expect(labelEventTopics(["bumped"], specs[1])).toEqual([]);
  });
});

describe("base64FromQueryParam", () => {
  it("restores pluses that a query string decoded as spaces", () => {
    expect(base64FromQueryParam("AAAAAgAAAAALEDS eRmphqUKYJ")).toBe("AAAAAgAAAAALEDS+eRmphqUKYJ");
  });

  it("leaves a correctly percent-encoded blob untouched", () => {
    const blob = "AAAAAgAAAAALEDS+eRmphqUKYJ/w==";
    expect(base64FromQueryParam(blob)).toBe(blob);
  });

  it("leaves the other base64 characters alone", () => {
    expect(base64FromQueryParam("a/b+c=")).toBe("a/b+c=");
  });
});

describe("labelEventData", () => {
  const mapSpec: ParsedEventSpec = {
    name: "NoteWritten",
    prefixTopics: ["note_written"],
    params: [
      { name: "name", type: "Symbol", location: "topic" },
      { name: "revision", type: "U32", location: "data" },
      { name: "author", type: "Address", location: "data" },
    ],
    dataFormat: "map",
  };

  const vecSpec: ParsedEventSpec = { ...mapSpec, dataFormat: "vec" };

  const singleSpec: ParsedEventSpec = {
    name: "Bumped",
    prefixTopics: ["bumped"],
    params: [{ name: "counter", type: "U32", location: "data" }],
    dataFormat: "single-value",
  };

  it("labels a map payload by field name", () => {
    expect(labelEventData('{"revision":2,"author":"GABC"}', mapSpec)).toEqual([
      { name: "revision", type: "U32", value: "2" },
      { name: "author", type: "Address", value: "GABC" },
    ]);
  });

  it("labels a vec payload positionally, which is the only way to read one", () => {
    expect(labelEventData('[2,"GABC"]', vecSpec)).toEqual([
      { name: "revision", type: "U32", value: "2" },
      { name: "author", type: "Address", value: "GABC" },
    ]);
  });

  it("labels a single-value payload from the display string as-is", () => {
    // scValToDisplay renders scalars bare, not JSON-quoted.
    expect(labelEventData("7", singleSpec)).toEqual([
      { name: "counter", type: "U32", value: "7" },
    ]);
  });

  it("refuses a vec whose length disagrees with the declaration", () => {
    expect(labelEventData("[2]", vecSpec)).toBeNull();
    expect(labelEventData('[2,"GABC",99]', vecSpec)).toBeNull();
  });

  it("refuses a map missing a declared field rather than labelling a gap", () => {
    expect(labelEventData('{"revision":2}', mapSpec)).toBeNull();
  });

  it("refuses a payload of the wrong shape for its format", () => {
    expect(labelEventData('[2,"GABC"]', mapSpec)).toBeNull();
    expect(labelEventData('{"revision":2,"author":"GABC"}', vecSpec)).toBeNull();
  });

  it("returns null for an unparsable payload", () => {
    expect(labelEventData("not json", mapSpec)).toBeNull();
  });

  it("returns null when the event declares no data fields", () => {
    const topicsOnly: ParsedEventSpec = {
      ...mapSpec,
      params: [{ name: "name", type: "Symbol", location: "topic" }],
    };
    expect(labelEventData("{}", topicsOnly)).toBeNull();
  });

  it("renders a nested value as JSON rather than [object Object]", () => {
    const nested: ParsedEventSpec = {
      ...singleSpec,
      dataFormat: "map",
      params: [{ name: "detail", type: "Map<Symbol, U32>", location: "data" }],
    };
    expect(labelEventData('{"detail":{"a":1}}', nested)).toEqual([
      { name: "detail", type: "Map<Symbol, U32>", value: '{"a":1}' },
    ]);
  });
});

describe("coerceArgInput with compound types", () => {
  it("coerces Vec elements to the declared element type", () => {
    const vec = coerceArgInput('["a","b"]', "Vec<Symbol>");
    expect(vec.switch().name).toBe("scvVec");
    // Inferring from JSON alone yields scvString here, which the contract rejects.
    expect(vec.vec()!.map((v) => v.switch().name)).toEqual(["scvSymbol", "scvSymbol"]);
    expect(vec.vec()!.map((v) => v.sym().toString())).toEqual(["a", "b"]);
  });

  it("coerces a Vec of the widest integer type without falling back to u64", () => {
    const vec = coerceArgInput("[1,2]", "Vec<I128>");
    expect(vec.vec()!.map((v) => v.switch().name)).toEqual(["scvI128", "scvI128"]);
  });

  it("handles a nested Vec", () => {
    const vec = coerceArgInput('[["a"],["b"]]', "Vec<Vec<Symbol>>");
    const inner = vec.vec()![0];
    expect(inner.switch().name).toBe("scvVec");
    expect(inner.vec()![0].switch().name).toBe("scvSymbol");
  });

  it("coerces an empty Vec", () => {
    expect(coerceArgInput("[]", "Vec<Symbol>").vec()).toEqual([]);
  });

  it("coerces Map keys and values to their declared types, in canonical order", () => {
    const map = coerceArgInput('{"b":2,"a":1}', "Map<Symbol, U32>");
    expect(map.switch().name).toBe("scvMap");
    const entries = map.map()!;
    expect(entries.map((e) => e.key().sym().toString())).toEqual(["a", "b"]);
    expect(entries.map((e) => e.val().switch().name)).toEqual(["scvU32", "scvU32"]);
  });

  it("treats an empty Option as void and a filled one as its inner type", () => {
    expect(coerceArgInput("", "Option<U32>").switch().name).toBe("scvVoid");
    expect(coerceArgInput("null", "Option<U32>").switch().name).toBe("scvVoid");
    expect(coerceArgInput("5", "Option<U32>").switch().name).toBe("scvU32");
  });

  it("reports what it wanted when the input isn't the right shape", () => {
    expect(() => coerceArgInput('"a"', "Vec<Symbol>")).toThrow(/expects a JSON array/);
    expect(() => coerceArgInput("[1]", "Map<Symbol, U32>")).toThrow(/expects a JSON object/);
  });

  it("still falls back to JSON inference for a contract's own types", () => {
    expect(coerceArgInput('{"a":1}', "SomeUdtType").switch().name).toBe("scvMap");
  });
});
