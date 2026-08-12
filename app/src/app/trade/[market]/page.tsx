"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useMarkets } from "@/hooks/use-markets";
import { usePriceHistory } from "@/hooks/use-price-history";
import { PriceChart } from "@/components/price-chart";
import { OrderForm } from "@/components/order-form";
import { MarketSwitcher } from "@/components/market-switcher";
import { PositionsDashboard } from "@/components/positions-dashboard";
import { marketMeta } from "@/lib/commodities-meta";
import { formatUsdPrice } from "@/lib/format";

export default function TradePage() {
  const params = useParams();
  const symbol = String(params.market ?? "").toUpperCase();
  const { markets, isLoading } = useMarkets();
  const market = markets.find((m) => m.symbol === symbol);
  const { data: history } = usePriceHistory(market?.id ?? -1, 200);

  if (!market) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="font-display text-2xl">{isLoading ? "Loading market…" : `“${symbol}” not found`}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-wheat hover:underline">
          ← Back to all markets
        </Link>
      </div>
    );
  }

  const points = (history ?? []).map((p) => ({ t: p.ts, v: Number(p.price) / 1e8 }));
  const change = points.length >= 2 ? ((points[points.length - 1].v - points[0].v) / points[0].v) * 100 : 0;
  const meta = marketMeta(market.symbol);

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          <MarketSwitcher current={market} markets={markets} />
          <div className="flex flex-col">
            <span className="tnum text-2xl font-medium leading-none">
              {market.stale ? <span className="text-wheat/90">stale</span> : formatUsdPrice(market.priceE8)}
            </span>
            <span className={"tnum mt-1 text-xs " + (change >= 0 ? "text-field" : "text-rust")}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}% · session
            </span>
          </div>
          <span className="label hidden rounded-full border border-bone/15 px-2 py-0.5 text-bone/55 sm:inline">
            {meta.group} · {market.maxLeverageX}× max
          </span>
        </div>
        <Link href="/" className="label text-bone/50 transition-colors hover:text-bone">
          ← All markets
        </Link>
      </div>

      {/* Terminal grid */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <PriceChart points={points} />
          <PositionsDashboard markets={markets} />
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <OrderForm market={market} />
        </div>
      </div>
    </div>
  );
}
