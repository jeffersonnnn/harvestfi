"use client";

import { useMarkets } from "@/hooks/use-markets";
import { PoolStats } from "@/components/pool-stats";
import { MarketsTable } from "@/components/markets-table";
import { PositionsDashboard } from "@/components/positions-dashboard";

export default function MarketsPage() {
  const { markets, isLoading } = useMarkets();
  const liveCount = markets.filter((m) => !m.stale).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="label text-wheat">The board</p>
          <h1 className="font-display text-3xl font-medium tracking-tight">Markets</h1>
        </div>
        <span className="label flex items-center gap-1.5 text-bone/50">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-field opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-field" />
          </span>
          {liveCount}/{markets.length} live
        </span>
      </div>

      <div className="mb-8">
        <PoolStats />
      </div>

      <MarketsTable markets={markets} isLoading={isLoading} />

      <section className="mt-10">
        <PositionsDashboard markets={markets} />
      </section>
    </div>
  );
}
