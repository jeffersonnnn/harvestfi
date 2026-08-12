"use client";

import { type MarketInfo } from "@/hooks/use-markets";
import { formatUsdPrice, formatETH } from "@/lib/format";

export function MarketsTable({
  markets,
  isLoading,
  onTrade,
}: {
  markets: MarketInfo[];
  isLoading: boolean;
  onTrade: (m: MarketInfo) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-white/40">
          <tr className="[&>th]:px-4 [&>th]:py-3">
            <th>Commodity</th>
            <th>Category</th>
            <th className="text-right">Price</th>
            <th className="text-right">Max lev</th>
            <th className="text-right">Open interest (L / S)</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {isLoading && markets.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                Loading markets…
              </td>
            </tr>
          )}
          {markets.map((m) => (
            <tr key={m.id} className="[&>td]:px-4 [&>td]:py-3">
              <td className="font-medium">
                {m.symbol}
                <span className="ml-1 text-xs text-white/30">/{m.unit}</span>
              </td>
              <td className="text-white/60">{m.category}</td>
              <td className="text-right">
                {m.stale ? (
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">
                    stale
                  </span>
                ) : (
                  <span>{formatUsdPrice(m.priceE8)}</span>
                )}
              </td>
              <td className="text-right text-white/60">{m.maxLeverageX}×</td>
              <td className="text-right text-white/60">
                {formatETH(m.longOI)} / {formatETH(m.shortOI)}
              </td>
              <td className="text-right">
                <button
                  disabled={m.stale}
                  onClick={() => onTrade(m)}
                  className="rounded-full bg-emerald-400 px-4 py-1.5 text-xs font-medium text-black hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Trade
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
