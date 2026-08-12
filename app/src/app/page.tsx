"use client";

import { useState } from "react";
import { useMarkets, type MarketInfo } from "@/hooks/use-markets";
import { PoolStats } from "@/components/pool-stats";
import { MarketsTable } from "@/components/markets-table";
import { TradePanel } from "@/components/trade-panel";
import { PositionsDashboard } from "@/components/positions-dashboard";
import { CHAIN_ID, IS_TESTNET } from "@/lib/chain";

export default function Home() {
  const { markets, isLoading } = useMarkets();
  const [selected, setSelected] = useState<MarketInfo | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Commodity Perps, <span className="text-emerald-400">owned by you.</span>
        </h1>
        <p className="mt-3 max-w-xl text-white/60">
          Perpetual futures on real-world commodities. Mint a market&apos;s
          license NFT and earn 70% of its trading fees.
        </p>
      </div>

      <PoolStats />

      <section>
        <h2 className="mb-3 text-sm font-medium text-white/50">Markets</h2>
        <MarketsTable markets={markets} isLoading={isLoading} onTrade={setSelected} />
      </section>

      <PositionsDashboard markets={markets} />

      {selected && (
        <TradePanel market={selected} onClose={() => setSelected(null)} />
      )}

      <p className="text-xs text-white/30">
        Wired to the live {IS_TESTNET ? "testnet" : "mainnet"} deployment (chain{" "}
        {CHAIN_ID}). Prices update as the keeper posts; markets show{" "}
        <span className="text-amber-300">stale</span> if it lapses.
      </p>
    </div>
  );
}
