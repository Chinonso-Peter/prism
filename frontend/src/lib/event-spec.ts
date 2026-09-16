// Matching emitted events against the declarations in a contract's spec.
//
// Deliberately free of runtime imports: the event log renders inside a client
// component, and these helpers work on already-decoded strings, so there's no
// reason to pull stellar-sdk's XDR machinery into the browser bundle. The type
// import below is erased at compile time.
import type { ParsedEventSpec } from "./xdr";

/**
 * Find the declaration an emitted event's topics correspond to.
 *
 * Events are matched on their fixed prefix topics, which is the only part of an
 * event guaranteed identical across every instance. The topic count has to
 * match the declaration exactly too — same prefix with a different arity is a
 * different event, not this one.
 */
export function matchEventSpec(
  topics: string[],
  specs: ParsedEventSpec[]
): ParsedEventSpec | undefined {
  return specs.find((spec) => {
    const topicParams = spec.params.filter((p) => p.location === "topic").length;
    if (topics.length !== spec.prefixTopics.length + topicParams) return false;
    return spec.prefixTopics.every((topic, i) => topics[i] === topic);
  });
}

/**
 * Pair an emitted event's topics with the names its declaration gives them.
 * The fixed prefix topics are dropped — they're the event's name, shown
 * separately — leaving only the fields that vary per instance.
 */
export function labelEventTopics(
  topics: string[],
  spec: ParsedEventSpec
): LabelledField[] {
  return spec.params
    .filter((p) => p.location === "topic")
    .map((param, i) => ({
      name: param.name,
      type: param.type,
      value: topics[spec.prefixTopics.length + i] ?? "",
    }));
}

export interface LabelledField {
  name: string;
  type: string;
  value: string;
}

/** Render a decoded JSON value the way the rest of Prism shows ScVals. */
function displayValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Pair an emitted event's data payload with the field names its declaration
 * gives them.
 *
 * The three data formats need different treatment. A `map` payload is already
 * self-describing, but reading it as labelled fields puts it in the same shape
 * as everything else. A `vec` payload is purely positional — without the
 * declaration there is no way to know which element is which. A
 * `single-value` payload is one bare value.
 *
 * Returns null whenever the payload doesn't match what the declaration
 * promises, so the caller can fall back to showing it raw instead of
 * confidently attaching the wrong name to a value.
 */
export function labelEventData(value: string, spec: ParsedEventSpec): LabelledField[] | null {
  const params = spec.params.filter((p) => p.location === "data");
  if (params.length === 0) return null;

  if (spec.dataFormat === "single-value") {
    // scValToDisplay renders a scalar bare rather than JSON-quoted, so the
    // display string is already the value.
    return params.length === 1
      ? [{ name: params[0].name, type: params[0].type, value }]
      : null;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return null;
  }

  if (spec.dataFormat === "vec") {
    if (!Array.isArray(decoded) || decoded.length !== params.length) return null;
    return params.map((param, i) => ({
      name: param.name,
      type: param.type,
      value: displayValue(decoded[i]),
    }));
  }

  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return null;
  const payload = decoded as Record<string, unknown>;
  if (!params.every((param) => param.name in payload)) return null;

  return params.map((param) => ({
    name: param.name,
    type: param.type,
    value: displayValue(payload[param.name]),
  }));
}
