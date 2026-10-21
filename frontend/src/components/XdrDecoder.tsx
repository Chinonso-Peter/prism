"use client";

import { useState, useTransition } from "react";
import { decodeXdrAction } from "@/lib/actions";
import type { XdrDecodeResult } from "@/lib/xdr";

type DecodeState = XdrDecodeResult | { error: string } | null;

interface Props {
  /** Blob from the ?input= query param, so a decode can be linked to. */
  initialInput?: string;
  initialResult?: DecodeState;
}

/**
 * Blobs beyond this length aren't written to the URL. A transaction envelope
 * is usually a few hundred bytes, but there's no upper bound on XDR, and a URL
 * long enough to be rejected by a proxy is worse than no link at all.
 */
const MAX_LINKABLE_LENGTH = 3000;

export default function XdrDecoder({ initialInput = "", initialResult = null }: Props) {
  const [input, setInput] = useState(initialInput);
  const [result, setResult] = useState<DecodeState>(initialResult);
  const [pending, startTransition] = useTransition();

  /**
   * Keep the address bar in step with what's on screen, so a decode can be
   * shared or reloaded. replaceState rather than a router navigation: the
   * result is already rendered, and re-fetching the page to show what's
   * already there would just make the input flicker.
   */
  function syncUrl(value: string) {
    const url = new URL(window.location.href);
    if (value && value.length <= MAX_LINKABLE_LENGTH) {
      url.searchParams.set("input", value);
    } else {
      url.searchParams.delete("input");
    }
    window.history.replaceState(null, "", url);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setResult(await decodeXdrAction(input));
      syncUrl(input.trim());
    });
  }

  function handleClear() {
    setInput("");
    setResult(null);
    syncUrl("");
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          rows={6}
          placeholder="AAAAAgAAAAA…"
          className="w-full bg-prism-surface border border-prism-border rounded-xl px-3 py-3 text-xs font-mono outline-none focus:border-prism-accent resize-y break-all"
        />
        <div className="flex gap-2 mt-3">
          <button
            type="submit"
            disabled={pending}
            className="bg-prism-accent text-white px-4 py-2 rounded-lg text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {pending ? "Decoding…" : "Decode"}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="border border-prism-border px-4 py-2 rounded-lg text-xs font-medium text-prism-muted hover:text-prism-strong transition"
          >
            Clear
          </button>
        </div>
      </form>

      {result && (
        <div className="mt-5">
          {"error" in result ? (
            <p className="text-prism-red text-sm">{result.error}</p>
          ) : (
            <div className="rounded-xl border border-prism-border bg-prism-surface p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-prism-green/20 text-prism-green">
                  {result.type}
                </span>
                <span className="text-xs text-prism-muted">detected type</span>
              </div>
              {result.fields.length === 0 ? (
                <p className="text-xs text-prism-muted italic">
                  Recognized as {result.type}, but Prism couldn&apos;t summarize its contents.
                </p>
              ) : (
                <dl className="space-y-3">
                  {result.fields.map((field) => (
                    <div key={field.label} className="grid grid-cols-[10rem_1fr] gap-3 items-start">
                      <dt className="text-xs text-prism-muted">{field.label}</dt>
                      <dd className="text-xs font-mono break-all whitespace-pre-wrap">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
