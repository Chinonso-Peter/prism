"use client";

import { useState } from "react";
import CopyButton from "./CopyButton";

interface Props {
  value: string;
  /** Values longer than this start collapsed to a preview. */
  previewLength?: number;
}

/**
 * A storage value that collapses when it is long.
 *
 * A large Vec or Map can run to thousands of characters, which stretches its
 * table row until the rest of the table is hard to read. Long values start as a
 * preview with an expand control. The copy button always copies the full value,
 * expanded or not.
 */
export default function ExpandableValue({ value, previewLength = 96 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isLong = value.length > previewLength;
  const shown = isLong && !expanded ? `${value.slice(0, previewLength)}...` : value;

  return (
    <div className="flex items-start gap-2">
      <span className="min-w-0 break-all">{shown}</span>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="shrink-0 text-xs border border-prism-border rounded px-2 py-0.5 text-prism-muted hover:text-white hover:border-prism-accent transition"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
      <CopyButton value={value} what="storage value" />
    </div>
  );
}
