import { redirect } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import { resolveSearchRoute } from "@/lib/search";

interface Props { searchParams: { q?: string } }

export default function SearchPage({ searchParams }: Props) {
  const query = (searchParams.q ?? "").trim();

  if (query) {
    const route = resolveSearchRoute(query);
    // Only redirect if the route is not /search itself (avoid infinite loop)
    if (route && !route.startsWith("/search")) redirect(route);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Search</h1>
      <SearchBar initialValue={query} />
      {query && (
        <p className="text-prism-muted mt-6 text-sm">
          No match for &quot;{query}&quot;. Try a transaction hash, a contract ID (starts with C), an
          account address (starts with G), or a ledger sequence number.
        </p>
      )}
    </div>
  );
}
