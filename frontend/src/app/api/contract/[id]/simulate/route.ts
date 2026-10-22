import { NextResponse } from "next/server";
import { getContractWasmInfo, simulateInvocation } from "@/lib/soroban";
import { coerceArgInput } from "@/lib/xdr";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** A simulation is a function name and a few short arguments; anything much larger isn't a real call. */
const MAX_BODY_BYTES = 16 * 1024;

interface Params { params: { id: string } }

interface SimulateBody {
  functionName?: string;
  args?: { value: string; type: string }[];
}

/**
 * Read the request body, giving up as soon as it passes `maxBytes` so an
 * oversized body is never buffered in full. Returns null when it is too large.
 */
async function readCappedBody(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(req: Request, { params }: Params) {
  const limited = rateLimit(req, { scope: "contract-simulate", max: 10 });
  if (limited) return limited;

  const raw = await readCappedBody(req, MAX_BODY_BYTES);
  if (raw === null) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  let body: SimulateBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.functionName) {
    return NextResponse.json({ error: "Missing required field: functionName" }, { status: 400 });
  }

  const args = body.args ?? [];
  if (!Array.isArray(args)) {
    return NextResponse.json({ error: "args must be an array" }, { status: 400 });
  }

  // Only check the count when the contract's spec declares the function; without
  // a spec (no WASM, or an RPC failure) the simulation itself decides.
  const wasm = await getContractWasmInfo(params.id);
  const declared = wasm?.functions.find((f) => f.name === body.functionName);
  if (declared && args.length > declared.inputs.length) {
    return NextResponse.json(
      {
        success: false,
        error: `${declared.name} takes ${declared.inputs.length} argument(s), but ${args.length} were given`,
      },
      { status: 400 }
    );
  }

  try {
    const scArgs = args.map((a) => coerceArgInput(a.value, a.type));
    const result = await simulateInvocation(params.id, body.functionName, scArgs);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Invalid arguments" },
      { status: 400 }
    );
  }
}
