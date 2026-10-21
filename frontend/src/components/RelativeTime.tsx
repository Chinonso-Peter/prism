"use client";

import { useEffect, useState } from "react";
import { formatTimestampUtc, timeAgo } from "@/lib/format";

interface Props { iso: string }

/**
 * An absolute UTC timestamp, with the time elapsed since then added once the
 * component mounts. The server and the first browser render both produce only
 * the absolute label, so hydration sees identical markup. The elapsed time is
 * recalculated on each render after mount, so live lists keep it current.
 */
export default function RelativeTime({ iso }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <time dateTime={iso}>
      {formatTimestampUtc(iso)}
      {mounted && ` (${timeAgo(iso)})`}
    </time>
  );
}
