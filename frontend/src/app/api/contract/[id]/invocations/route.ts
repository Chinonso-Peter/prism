import { NextResponse } from "next/server";
import { getInvocationHistoryPage } from "@/lib/soroban";
import { parsePageRequest } from "@/lib/history-cursor";
import { INVOCATION_PAGE_SIZE } from "@/lib/contract-lists";
import { rateLimitRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const limited = rateLimitRequest(req, { scope: "contract-invocations" });
  if (limited) return limited;

  const request = parsePageRequest(new URL(req.url), INVOCATION_PAGE_SIZE);
  if (!request) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

  const { items, nextCursor } = await getInvocationHistoryPage(params.id, request);
  return NextResponse.json({ invocations: items, nextCursor });
}
