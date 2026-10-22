import { NextResponse } from "next/server";
import { getLedger } from "@/lib/horizon";
import { rateLimitRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface Params { params: { seq: string } }

export async function GET(req: Request, { params }: Params) {
  const limited = rateLimitRequest(req, { scope: "ledger" });
  if (limited) return limited;

  const seq = parseInt(params.seq, 10);
  if (isNaN(seq)) {
    return NextResponse.json({ error: "Invalid ledger sequence" }, { status: 400 });
  }

  try {
    const ledger = await getLedger(seq);
    return NextResponse.json(ledger);
  } catch {
    return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
  }
}
