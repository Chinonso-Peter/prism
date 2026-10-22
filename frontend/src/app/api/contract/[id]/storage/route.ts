import { NextResponse } from "next/server";
import { lookupStorageEntry, parseStorageKeyInput, type StorageKeyKind } from "@/lib/soroban";
import { rateLimitRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

const VALID_KINDS: StorageKeyKind[] = ["symbol", "string", "u32", "address"];

export async function GET(req: Request, { params }: Params) {
  const limited = rateLimitRequest(req, { scope: "contract-storage" });
  if (limited) return limited;

  const searchParams = new URL(req.url).searchParams;
  const key = searchParams.get("key");
  const kind = searchParams.get("kind") as StorageKeyKind | null;
  const durability = searchParams.get("durability") === "temporary" ? "temporary" : "persistent";

  if (!key) {
    return NextResponse.json({ error: "Missing required query param: key" }, { status: 400 });
  }
  if (!kind || !VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${VALID_KINDS.join(", ")}` }, { status: 400 });
  }

  try {
    const scKey = parseStorageKeyInput(key, kind);
    const entry = await lookupStorageEntry(params.id, scKey, durability);
    if (!entry) {
      return NextResponse.json({ error: "No entry found for that key" }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid key" }, { status: 400 });
  }
}
