import { NextResponse } from "next/server";
import { getContractInfo } from "@/lib/soroban";
import { rateLimitRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const limited = rateLimitRequest(req, { scope: "contract-info" });
  if (limited) return limited;

  const info = await getContractInfo(params.id);
  if (!info) {
    return NextResponse.json({ error: "Contract not found or unreachable" }, { status: 404 });
  }
  return NextResponse.json(info);
}
