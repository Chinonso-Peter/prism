import { NextResponse } from "next/server";
import { getContractInfo, getContractWasmInfo } from "@/lib/soroban";
import { rateLimitRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const limited = rateLimitRequest(req, { scope: "contract-wasm" });
  if (limited) return limited;

  const info = await getContractInfo(params.id);
  if (!info) {
    return NextResponse.json({ error: "Contract not found or unreachable" }, { status: 404 });
  }
  if (info.executable !== "wasm") {
    return NextResponse.json({ error: "This contract has no WASM — it's a Stellar Asset Contract" }, { status: 400 });
  }
  const wasm = await getContractWasmInfo(params.id);
  if (!wasm) {
    return NextResponse.json({ error: "Could not fetch WASM bytecode" }, { status: 502 });
  }
  return NextResponse.json(wasm);
}
