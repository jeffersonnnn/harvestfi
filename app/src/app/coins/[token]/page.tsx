"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { isAddress, type Address } from "viem";
import { useCoin } from "@/hooks/use-coin";
import { useLaunches } from "@/hooks/use-launches";
import { useMarkets } from "@/hooks/use-markets";
import { PriceChart } from "@/components/price-chart";
import { CoinTradePanel } from "@/components/coin-trade-panel";
import { marketCapUsd } from "@/lib/coin-market";
import { prettyName, marketMeta } from "@/lib/commodities-meta";
import { EXPLORER_URL } from "@/lib/chain";
import { truncateAddress } from "@/lib/format";

export default function CoinPage() {
  const params = useParams<{ token: string }>();
  const token = (params?.token ?? "") as string;
  const valid = isAddress(token);
  const addr = token as Address;

  const { name, symbol, stats, loading, ethUsd } = useCoin(valid ? addr : undefined);
  const { items } = useLaunches();
  const { markets } = useMarkets();

  const launch = useMemo(() => items.find((i) => i.token.toLowerCase() === token.toLowerCase()), [items, token]);
  const market = markets.find((m) => m.id === launch?.marketId);

  if (!valid) {
    return <Shell><p className="text-bone/60">Invalid coin address.</p></Shell>;
  }

  const priceUsd = stats ? stats.priceEth * ethUsd : 0;
  const mcap = stats ? marketCapUsd(stats.priceEth, ethUsd) : 0;
  const vol = stats ? stats.volumeEth24h * ethUsd : 0;

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {market && (
            <span className="grid h-14 w-14 place-items-center rounded-xl bg-soil-800 text-3xl">
              {marketMeta(market.symbol).glyph}
            </span>
          )}
          <div>
            <h1 className="font-display text-3xl font-medium leading-tight">{symbol ?? "…"}</h1>
            <div className="text-sm text-bone/50">
              {name ?? truncateAddress(addr)}
              {market && (
                <>
                  {" · themed on "}
                  <span className="text-wheat">{prettyName(market.symbol)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <a className="text-wheat hover:underline" href={`https://pools.trade/t/${addr}`} target="_blank" rel="noreferrer">pools.trade ↗</a>
          <a className="text-wheat hover:underline" href={`${EXPLORER_URL}/address/${addr}`} target="_blank" rel="noreferrer">explorer ↗</a>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Price" value={loading && !stats ? "…" : fmtUsd(priceUsd)} />
        <Stat label="Market cap" value={loading && !stats ? "…" : fmtUsd(mcap)} accent />
        <Stat label="24h volume" value={loading && !stats ? "…" : fmtUsd(vol)} />
        <Stat label="Trades" value={stats ? String(stats.trades) : "…"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* chart */}
        <div className="rounded-2xl border border-bone/10 bg-soil-900/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="label text-bone/50">Price · USD</span>
            <span className="label text-field">live · real pool trades</span>
          </div>
          <div className="h-[340px]">
            {stats && stats.points.length > 1 ? (
              <PriceChart points={stats.points} />
            ) : (
              <div className="grid h-full place-items-center text-sm text-bone/40">
                {loading ? "Loading pool…" : "No trades yet — be the first."}
              </div>
            )}
          </div>
        </div>

        {/* trade */}
        <CoinTradePanel token={addr} symbol={symbol} priceEth={stats?.priceEth ?? 0} ethUsd={ethUsd} />
      </div>

      <p className="text-xs text-bone/40">
        The coin price above is real (from its Uniswap v4 pool). The commodity benchmark price shown elsewhere on
        HarvestFi is simulated. Nothing here is investment advice.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-5 py-10 sm:px-8">
      <Link href="/coins" className="label text-bone/40 hover:text-bone/70">
        ← All coins
      </Link>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-bone/10 bg-soil-900/40 px-4 py-3">
      <div className="label text-bone/45">{label}</div>
      <div className={`tnum mt-1 text-xl ${accent ? "text-wheat" : "text-bone"}`}>{value}</div>
    </div>
  );
}

function fmtUsd(v: number): string {
  if (!isFinite(v) || v === 0) return "$0";
  if (v >= 1000) return "$" + (v / (v >= 1e6 ? 1e6 : 1e3)).toFixed(1) + (v >= 1e6 ? "M" : "K");
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(4);
  return "$" + v.toPrecision(3); // tiny prices → e.g. $2.52e-9
}
