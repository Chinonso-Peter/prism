import type { Metadata } from "next";
import XdrDecoder from "@/components/XdrDecoder";
import { decodeXdrAction } from "@/lib/actions";
import { base64FromQueryParam } from "@/lib/xdr";

export const metadata: Metadata = {
  title: "XDR Decoder | Prism",
  description:
    "Decode raw base64 Stellar/Soroban XDR — transaction envelopes, results, meta, ledger entries and keys, contract spec entries, and ScVals.",
};

interface Props {
  searchParams: { input?: string };
}

export default async function XdrPage({ searchParams }: Props) {
  const input = searchParams.input ? base64FromQueryParam(searchParams.input) : undefined;
  const result = input ? await decodeXdrAction(input) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">XDR Decoder</h1>
      <p className="text-prism-muted text-sm mb-6 max-w-2xl">
        Paste any base64 XDR blob — a transaction envelope from Horizon, a result or meta field, a ledger
        entry or key, a contract spec entry, or a bare ScVal. XDR carries no type tag, so Prism identifies
        the type by decoding and re-encoding each candidate and keeping the one that reproduces your input
        exactly.
      </p>
      <XdrDecoder initialInput={input} initialResult={result} />
    </div>
  );
}
