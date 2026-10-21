import { NextResponse } from "next/server";
import { simulateInvocation, getContractWasmInfo } from "@/lib/soroban";
import { coerceArgInput } from "@/lib/xdr";
import { rateLimitRequest } from "@/lib/rate-limit";
import type { ContractTypeDef } from "@/types";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

interface SimulateBody {
  functionName?: string;
  args?: { value: string; type: string }[];
  /**
   * Optional contract type definitions (structs, unions, enums) used to
   * coerce structured arguments correctly — the same path the UI takes via
   * the server action. When omitted, Prism fetches the types from the WASM
   * (using the cached result when available) so API callers get the same
   * coercion quality as the UI without having to supply the types themselves.
   */
  types?: ContractTypeDef[];
}

export async function POST(req: Request, { params }: Params) {
  const limited = rateLimitRequest(req, { scope: "contract-simulate", max: 10 });
  if (limited) return limited;

  let body: SimulateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.functionName) {
    return NextResponse.json({ error: "Missing required field: functionName" }, { status: 400 });
  }

  // Resolve type definitions: use the caller-supplied list when present,
  // otherwise fetch from the WASM so structured arguments are coerced the
  // same way as through the UI's server action.
  let types: ContractTypeDef[] = body.types ?? [];
  if (types.length === 0) {
    const wasmInfo = await getContractWasmInfo(params.id);
    types = wasmInfo?.types ?? [];
  }

  try {
    const scArgs = (body.args ?? []).map((a) => coerceArgInput(a.value, a.type, types));
    const result = await simulateInvocation(params.id, body.functionName, scArgs);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Invalid arguments" },
      { status: 400 }
    );
  }
}
