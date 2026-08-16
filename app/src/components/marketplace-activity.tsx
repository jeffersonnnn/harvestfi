"use client";

import { EXPLORER_URL } from "@/lib/chain";
import { formatETH, truncateAddress } from "@/lib/format";
import { marketMeta, prettyName } from "@/lib/commodities-meta";
import type { MarketInfo } from "@/hooks/use-markets";
import type { MarketplaceData } from "@/hooks/use-marketplace";

/** Marketplace traction: total sales + volume, and a recent listed/sold activity feed. */
export function MarketplaceActivity({ markets, data }: { markets: MarketInfo[]; data: MarketplaceData }) {
  const { activity, volume, salesCount, loading } = data;
  if (loading) return null;

  const nameOf = (id: number) => {
    const m = markets.find((x) => x.id === id);
    return m ? prettyName(m.symbol) : `License #${id}`;
  };
  const glyphOf = (id: number) => {
    const m = markets.find((x) => x.id === id);
    return m ? marketMeta(m.symbol).glyph : "•";
  };

  return (
    <div className="rounded-2xl border border-bone/10 bg-soil-900/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label text-wheat">Marketplace activity</p>
        <div className="flex gap-6">
          <Stat label="Sales" value={String(salesCount)} />
          <Stat label="Volume" value={`${formatETH(volume, 4)} ETH`} />
        </div>
      </div>

      {activity.length === 0 ? (
        <p className="mt-3 text-sm text-bone/50">No listings or sales yet — list a license to be the first.</p>
      ) : (
        <ul className="mt-3 divide-y divide-bone/5">
          {activity.map((a, i) => (
            <li key={`${a.txHash}-${i}`} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2.5">
                <span className="text-base">{glyphOf(a.tokenId)}</span>
                <span className="text-bone/85">{nameOf(a.tokenId)}</span>
                <span className={`label ${a.kind === "sold" ? "text-field" : "text-wheat"}`}>{a.kind}</span>
                <span className="tnum text-bone/60">{formatETH(a.price, 4)} ETH</span>
              </span>
              <a
                href={`${EXPLORER_URL}/tx/${a.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="tnum text-xs text-bone/40 hover:text-wheat"
              >
                {a.kind === "sold" ? "to " : "by "}
                {truncateAddress(a.who)} ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="label text-bone/40">{label}</div>
      <div className="tnum text-bone/85">{value}</div>
    </div>
  );
}
