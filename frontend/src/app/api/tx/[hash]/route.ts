import { NextResponse } from "next/server";
import { xdr } from "@stellar/stellar-sdk";
import { getTransaction } from "@/lib/horizon";
import { getInvocationReturnValue } from "@/lib/soroban";
import { decodeInvocation, getResourceUsage } from "@/lib/xdr";
import { rateLimitRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface Params { params: { hash: string } }

export async function GET(req: Request, { params }: Params) {
  const limited = rateLimitRequest(req, { scope: "tx" });
  if (limited) return limited;

  let tx;
  try {
    tx = await getTransaction(params.hash);
  } catch {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const envelope = xdr.TransactionEnvelope.fromXDR(tx.envelopeXdr, "base64");
  const invocation = decodeInvocation(envelope);
  const resources = getResourceUsage(envelope);
  const returnValue = invocation ? await getInvocationReturnValue(tx.hash) : null;

  return NextResponse.json({ ...tx, invocation, resources, returnValue });
}
