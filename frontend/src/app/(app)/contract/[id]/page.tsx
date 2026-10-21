import type { Metadata } from "next";
import { getContractInfo, getContractWasmInfo, getContractEvents, getInvocationHistory, getFullStorageEntries } from "@/lib/soroban";
import { isIndexerConfigured } from "@/lib/indexed-db";
import ContractOverview from "@/components/ContractOverview";
import ContractStorageView from "@/components/ContractStorageView";
import LiveInvocationHistory from "@/components/LiveInvocationHistory";
import InvokeTool from "@/components/InvokeTool";
import LiveEventLog from "@/components/LiveEventLog";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";

interface Props { params: { id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const contractId = params.id;
  const info = await getContractInfo(contractId);
  const title = `Contract ${contractId}`;
  const description = info
    ? `Contract ${contractId} on Stellar Soroban — executable: ${info.executable}.`
    : `Contract ${contractId} on Stellar Soroban.`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
  };
}

export default async function ContractPage({ params }: Props) {
  const contractId = params.id;
  const info = await getContractInfo(contractId);
  const [wasm, events, invocations, fullStorage] = await Promise.all([
    info.executable === "wasm" ? getContractWasmInfo(contractId) : Promise.resolve(null),
    getContractEvents(contractId),
    getInvocationHistory(contractId),
    getFullStorageEntries(contractId),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Contract</h1>
      <div className="flex items-start gap-2 mb-8">
        <p className="text-prism-muted font-mono text-sm break-all">{contractId}</p>
        <CopyButton value={contractId} what="contract ID" />
      </div>

      <div className="grid grid-cols-1 gap-8">
        <section>
          <h2 className="text-lg font-semibold mb-3">Overview</h2>
          <ContractOverview info={info} wasm={wasm} />
        </section>

        {wasm && wasm.functions.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Invoke (simulate)</h2>
            <InvokeTool contractId={contractId} functions={wasm.functions} types={wasm.types} />
          </section>
        )}

        <section>
          <h2 className="text-lg font-semibold mb-3">Storage</h2>
          <ContractStorageView
            contractId={contractId}
            instanceStorage={info.instanceStorage ?? []}
            fullStorage={fullStorage}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            Recent Invocations
            <LiveBadge />
          </h2>
          <LiveInvocationHistory
            contractId={contractId}
            initialItems={invocations}
            derivedFromEvents={!isIndexerConfigured()}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            Events
            <LiveBadge />
          </h2>
          <LiveEventLog contractId={contractId} initialEvents={events} specs={wasm?.events} />
        </section>
      </div>
    </div>
  );
}

function LiveBadge() {
  return (
    <span className="flex items-center gap-1.5 text-xs font-normal text-prism-muted">
      <span className="w-1.5 h-1.5 rounded-full bg-prism-green animate-pulse" />
      auto-updating
    </span>
  );
}
