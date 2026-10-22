"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import EventLog from "./EventLog";
import SectionHeader from "./SectionHeader";
import { EVENT_PAGE_SIZE } from "@/lib/contract-lists";
import type { ContractEvent, ContractEventSpec } from "@/types";

interface Props {
  contractId: string;
  initialEvents: ContractEvent[];
  initialNextCursor: string | null;
  /** Page size the list is fetched with, used to tell when the RPC fallback is capped. */
  limit: number;
  /** True when no indexer is configured, so the events come from the RPC node. */
  rpcFallback: boolean;
  /** Event declarations from the contract spec, used to name and label events. */
  specs?: ContractEventSpec[];
  title: string;
  /** Rendered after the count in the section header. */
  children?: ReactNode;
  intervalMs?: number;
}

export default function LiveEventLog({
  contractId,
  initialEvents,
  initialNextCursor,
  limit,
  rpcFallback,
  specs,
  title,
  children,
  intervalMs = 15_000,
}: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/contract/${contractId}/events`);
        if (!res.ok) return;
        const data = await res.json();
        setEvents(data.events);
        setNextCursor(data.nextCursor ?? null);
      } catch {
        // keep showing the last good data
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [contractId, intervalMs]);

  return (
    <>
      <SectionHeader title="Events" count={events.length} cap={EVENT_PAGE_SIZE} live />
      <EventLog events={events} specs={specs} />
    </>
  );
}
