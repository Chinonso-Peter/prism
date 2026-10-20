import { describe, expect, it } from "vitest";
import { labelEventData, labelEventTopics, matchEventSpec } from "./event-spec";
import type { ParsedEventSpec } from "./xdr";

const mapSpec: ParsedEventSpec = {
  name: "Transfer",
  prefixTopics: ["transfer"],
  params: [
    { name: "from", type: "Address", location: "topic" },
    { name: "to", type: "Address", location: "data" },
    { name: "amount", type: "i128", location: "data" },
  ],
  dataFormat: "map",
};

describe("matchEventSpec", () => {
  it("matches a declaration by prefix topics and exact topic arity", () => {
    expect(matchEventSpec(["transfer", "GABC"], [mapSpec])).toBe(mapSpec);
  });

  it("does not match a different prefix or a topic arity mismatch", () => {
    expect(matchEventSpec(["mint", "GABC"], [mapSpec])).toBeUndefined();
    expect(matchEventSpec(["transfer"], [mapSpec])).toBeUndefined();
    expect(matchEventSpec(["transfer", "GABC", "extra"], [mapSpec])).toBeUndefined();
  });
});

describe("labelEventTopics", () => {
  it("labels topics after the fixed prefix", () => {
    expect(labelEventTopics(["transfer", "GABC"], mapSpec)).toEqual([
      { name: "from", type: "Address", value: "GABC" },
    ]);
  });

  it("uses an empty value when a declared topic is missing", () => {
    const spec: ParsedEventSpec = {
      ...mapSpec,
      params: [...mapSpec.params, { name: "memo", type: "Symbol", location: "topic" }],
    };
    expect(labelEventTopics(["transfer", "GABC"], spec)).toEqual([
      { name: "from", type: "Address", value: "GABC" },
      { name: "memo", type: "Symbol", value: "" },
    ]);
  });
});

describe("labelEventData", () => {
  it("labels map payload fields", () => {
    expect(labelEventData('{"to":"GDEF","amount":7}', mapSpec)).toEqual([
      { name: "to", type: "Address", value: "GDEF" },
      { name: "amount", type: "i128", value: "7" },
    ]);
  });

  it("falls back to raw output for malformed or incomplete map payloads", () => {
    expect(labelEventData("not json", mapSpec)).toBeNull();
    expect(labelEventData('{"to":"GDEF"}', mapSpec)).toBeNull();
    expect(labelEventData("[]", mapSpec)).toBeNull();
  });

  it("labels vector elements by position and rejects an arity mismatch", () => {
    const spec: ParsedEventSpec = { ...mapSpec, dataFormat: "vec" };
    expect(labelEventData('["GDEF",7]', spec)).toEqual([
      { name: "to", type: "Address", value: "GDEF" },
      { name: "amount", type: "i128", value: "7" },
    ]);
    expect(labelEventData('["GDEF"]', spec)).toBeNull();
    expect(labelEventData('{"to":"GDEF"}', spec)).toBeNull();
  });

  it("labels a single value and falls back if its declaration has the wrong arity", () => {
    const spec: ParsedEventSpec = {
      name: "Count",
      prefixTopics: ["count"],
      params: [{ name: "value", type: "u32", location: "data" }],
      dataFormat: "single-value",
    };
    expect(labelEventData("9", spec)).toEqual([
      { name: "value", type: "u32", value: "9" },
    ]);
    expect(
      labelEventData("9", {
        ...spec,
        params: [...spec.params, { name: "other", type: "u32", location: "data" }],
      })
    ).toBeNull();
  });

  it("does not label an event with no data parameters", () => {
    expect(labelEventData("{}", { ...mapSpec, params: [] })).toBeNull();
  });
});
