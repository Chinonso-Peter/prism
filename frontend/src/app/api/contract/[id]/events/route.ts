import { NextResponse } from "next/server";
import { getContractEvents } from "@/lib/soroban";
import { rateLimitRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const limited = rateLimitRequest(req, { scope: "contract-events" });
  if (limited) return limited;

  const limit = Number(new URL(req.url).searchParams.get("limit") ?? "50");
  const events = await getContractEvents(params.id, Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ events });
}
