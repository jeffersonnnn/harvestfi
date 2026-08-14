"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLaunches } from "@/hooks/use-launches";
import { useMarkets } from "@/hooks/use-markets";
import { useEthUsd } from "@/hooks/use-eth-usd";
import { CoinCard } from "@/components/coin-card";
import { prettyName } from "@/lib/commodities-meta";

export default function CoinsPage() {
  const { items, enabled, isLoading } = useLaunches();
  const { markets } = useMarkets();
  const ethUsd = useEthUsd();
  const [filter, setFilter] = useState<number | "all">("all");

  const marketById = useMemo(() => new Map(markets.map((m) => [m.id, m])), [markets]);
  const marketsWithCoins = useMemo(() => {
    const s = new Set(items.map((i) => i.marketId));
    return markets.filter((m) => s.has(m.id));
  }, [items, markets]);
  const shown = filter === "all" ? items : items.filter((i) => i.marketId === filter);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-10 sm:px-8">
      <div>
        <p className="label text-wheat">The board</p>
        <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">Coins</h1>
        <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-bone/65">
          Every coin launched on HarvestFi, paired to its commodity market. Hold a coin&apos;s creator-fee NFT?
          Collect your fees right here.{" "}
          <Link href="/launch" className="text-wheat hover:underline">
            Launch one →
          </Link>
        </p>
      </div>

      {!enabled ? (
        <Empty text="The launch registry is not deployed yet. Coins will list here once it is live." />
      ) : isLoading ? (
        <Empty text="Loading coins..." />
      ) : items.length === 0 ? (
        <Empty text="No coins launched yet. Be the first from the Launch page." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              All ({items.length})
            </Chip>
            {marketsWithCoins.map((m) => (
              <Chip key={m.id} active={filter === m.id} onClick={() => setFilter(m.id)}>
                {prettyName(m.symbol)}
              </Chip>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((i) => (
              <CoinCard key={i.token} item={i} market={marketById.get(i.marketId)} ethUsd={ethUsd} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-bone/10 bg-soil-900/30 px-6 py-12 text-center text-sm text-bone/50">
      {text}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
        active ? "bg-wheat text-soil-950" : "border border-bone/15 text-bone/70 hover:bg-bone/10"
      }`}
    >
      {children}
    </button>
  );
}
