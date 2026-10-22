"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import InvocationHistory from "./InvocationHistory";
import SectionHeader from "./SectionHeader";
import { INVOCATION_PAGE_SIZE } from "@/lib/contract-lists";
import type { InvocationHistoryItem } from "@/types";

interface Props {
  contractId: string;
  initialItems: InvocationHistoryItem[];
  initialNextCursor: string | null;
  /** Page size the list is fetched with, used to tell when the RPC fallback is capped. */
  limit: number;
  /** True when no indexer is configured, so the items come from recent RPC events. */
  derivedFromEvents: boolean;
  title: string;
  /** Rendered after the count in the section header. */
  children?: ReactNode;
  intervalMs?: number;
}

export default function LiveInvocationHistory({
  contractId,
  initialItems,
  initialNextCursor,
  limit,
  derivedFromEvents,
  title,
  children,
  intervalMs = 15_000,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/contract/${contractId}/invocations`);
        if (!res.ok) return;
        const data = await res.json();
        setItems(data.invocations);
        setNextCursor(data.nextCursor ?? null);
      } catch {
        // keep showing the last good data
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [contractId, intervalMs]);

  return (
    <>
      <SectionHeader title="Recent Invocations" count={items.length} cap={INVOCATION_PAGE_SIZE} live />
      <InvocationHistory items={items} derivedFromEvents={derivedFromEvents} />
    </>
  );
}
