"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { resolveSearchRoute } from "@/lib/search";

interface Props { initialValue?: string }

export default function SearchBar({ initialValue = "" }: Props) {
  const [query, setQuery] = useState(initialValue);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const route = resolveSearchRoute(query);
    if (route) router.push(route);
  }

  return (
    <form onSubmit={handleSearch} className="flex gap-2">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tx, contract, account, ledger — press / to focus"
        className="flex-1 bg-prism-bg border border-prism-border rounded-lg px-4 py-2 text-sm outline-none focus:border-prism-accent font-mono placeholder:font-sans placeholder:text-prism-muted"
      />
      <button
        type="submit"
        className="bg-prism-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition"
      >
        Search
      </button>
    </form>
  );
}
