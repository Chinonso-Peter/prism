"use client";

import { useEffect, useState } from "react";
import EventLog from "./EventLog";
import SectionHeader from "./SectionHeader";
import { EVENT_PAGE_SIZE } from "@/lib/contract-lists";
import type { ContractEvent, ContractEventSpec } from "@/types";

interface Props {
  contractId: string;
  initialEvents: ContractEvent[];
  /** Event declarations from the contract spec, used to name and label events. */
  specs?: ContractEventSpec[];
  intervalMs?: number;
}

export default function LiveEventLog({
  contractId,
  initialEvents,
  specs,
  intervalMs = 15_000,
}: Props) {
  const [events, setEvents] = useState(initialEvents);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/contract/${contractId}/events`);
        if (!res.ok) return;
        const data = await res.json();
        setEvents(data.events);
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
