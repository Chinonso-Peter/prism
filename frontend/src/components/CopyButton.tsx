"use client";

import { useState } from "react";

interface Props {
  value: string;
  /** What's being copied, for the accessible label — e.g. "contract ID". */
  what: string;
}

/**
 * Copy an identifier to the clipboard.
 *
 * Contract IDs and transaction hashes are 56-64 characters of base32/hex that
 * nobody retypes, and selecting one by hand tends to grab the surrounding
 * whitespace too.
 *
 * navigator.clipboard is only available in a secure context, so a Prism served
 * over plain HTTP on a LAN address won't have it. The button then says so and
 * asks the user to select the text by hand, rather than claiming a copy that
 * didn't happen.
 */
export default function CopyButton({ value, what }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1500);
    } catch {
      // No clipboard access — tell the user to select the text instead.
      setStatus("failed");
      window.setTimeout(() => setStatus("idle"), 3000);
    }
  }

  const label =
    status === "copied"
      ? `${what} copied`
      : status === "failed"
        ? `Couldn't copy ${what}; select it to copy`
        : `Copy ${what}`;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `${what} copied` : `Copy ${what}`}
      className="shrink-0 text-xs border border-prism-border rounded px-2 py-0.5 text-prism-muted hover:text-prism-strong hover:border-prism-accent transition"
    >
      {status === "copied" ? "Copied" : status === "failed" ? "Select to copy" : "Copy"}
    </button>
  );
}
