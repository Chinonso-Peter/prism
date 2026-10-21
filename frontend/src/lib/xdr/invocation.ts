import { Address, xdr } from "@stellar/stellar-sdk";
import type { OperationInvocation, ResourceUsage, SorobanInvocation } from "@/types";
import { scValToDisplay } from "./display";

/**
 * The v1 transaction body, unwrapping a fee bump to reach the inner one.
 *
 * Returns null for v0 envelopes: they predate Soroban and have a different
 * shape (a bare ed25519 key rather than a muxed account, and no Soroban
 * resource data), so callers looking for contract activity have nothing to
 * find in one.
 */
export function v1Tx(envelope: xdr.TransactionEnvelope): xdr.Transaction | null {
  const kind = envelope.switch().name;
  if (kind === "envelopeTypeTxFeeBump") return envelope.feeBump().tx().innerTx().v1().tx();
  if (kind === "envelopeTypeTx") return envelope.v1().tx();
  return null;
}

/**
 * Decode every InvokeHostFunction contract call in a transaction envelope, in
 * operation order. A transaction can call several contracts, so each call is
 * tagged with the index of the operation it came from.
 */
export function decodeInvocations(envelope: xdr.TransactionEnvelope): OperationInvocation[] {
  try {
    const tx = v1Tx(envelope);
    if (!tx) return [];
    const invocations: OperationInvocation[] = [];
    tx.operations().forEach((op, operationIndex) => {
      if (op.body().switch().name !== "invokeHostFunction") return;
      const hostFn = op.body().invokeHostFunctionOp().hostFunction();
      if (hostFn.switch().name !== "hostFunctionTypeInvokeContract") return;
      const invoke = hostFn.invokeContract();
      invocations.push({
        operationIndex,
        contractId: Address.fromScAddress(invoke.contractAddress()).toString(),
        functionName: invoke.functionName().toString(),
        args: invoke.args().map(scValToDisplay),
      });
    });
    return invocations;
  } catch {
    return [];
  }
}

/** Decode a transaction envelope's first InvokeHostFunction contract call (function name + args), if any. */
export function decodeInvocation(envelope: xdr.TransactionEnvelope): SorobanInvocation | null {
  return decodeInvocations(envelope)[0] ?? null;
}

/** Decode a transaction envelope's Soroban resource footprint (instructions, I/O bytes, resource fee), if any. */
export function getResourceUsage(envelope: xdr.TransactionEnvelope): ResourceUsage | null {
  try {
    const tx = v1Tx(envelope);
    if (!tx) return null;
    const ext = tx.ext();
    if (ext.switch() !== 1) return null;
    const data = ext.sorobanData();
    const resources = data.resources();
    return {
      instructions: resources.instructions(),
      readBytes: resources.diskReadBytes(),
      writeBytes: resources.writeBytes(),
      resourceFeeStroops: data.resourceFee().toString(),
    };
  } catch {
    return null;
  }
}
