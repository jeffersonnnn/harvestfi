"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { type MarketInfo } from "@/hooks/use-markets";
import { usePriceHistory } from "@/hooks/use-price-history";
import { useLivePriceE8 } from "@/hooks/use-live-price";
import { Sparkline } from "@/components/sparkline";
import { formatUsdPrice, formatETH } from "@/lib/format";
import { marketMeta, prettyName, GROUPS, type Group } from "@/lib/commodities-meta";

export function MarketsTable({ markets, isLoading }: { markets: MarketInfo[]; isLoading: boolean }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<Group | "All">("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return markets.filter((m) => {
      const g = marketMeta(m.symbol).group;
      if (group !== "All" && g !== group) return false;
      if (!q) return true;
      return m.symbol.toLowerCase().includes(q) || prettyName(m.symbol).toLowerCase().includes(q);
    });
  }, [markets, query, group]);

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={group === "All"} onClick={() => setGroup("All")}>
            All
          </Chip>
          {GROUPS.map((g) => (
            <Chip key={g} active={group === g} onClick={() => setGroup(g)}>
              {g}
            </Chip>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bone/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commodities…"
            className="w-full rounded-full border border-bone/10 bg-soil-900/60 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-bone/35 focus:border-wheat/40"
          />
        </div>
      </div>

      {/* Board */}
      <div className="overflow-x-auto rounded-2xl border border-bone/10 bg-soil-900/40">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="label border-b border-bone/10 text-left text-bone/40 [&>th]:px-4 [&>th]:py-3 [&>th]:font-normal">
              <th>Commodity</th>
              <th>Group</th>
              <th className="text-right">Price</th>
              <th className="text-center">Trend</th>
              <th className="text-right">Max lev.</th>
              <th className="text-right">Open interest · L / S</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && markets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-bone/40">
                  Reading the board…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-bone/40">
                  No commodities match.
                </td>
              </tr>
            )}
            {filtered.map((m) => (
              <MarketRow key={m.id} m={m} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarketRow({ m }: { m: MarketInfo }) {
  const meta = marketMeta(m.symbol);
  const { data: history } = usePriceHistory(m.id, m.symbol);
  const values = (history ?? []).map((p) => Number(p.price));

  // Live-ticking price for simulated markets (display only; trades use the on-chain oracle).
  const live = useLivePriceE8(m.symbol, m.priceE8, m.stale);
  const shown = formatUsdPrice(live);
  const prev = useRef({ shown, e8: live });
  const [dir, setDir] = useState<"up" | "down" | "">("");
  useEffect(() => {
    if (shown !== prev.current.shown) setDir(live > prev.current.e8 ? "up" : "down");
    prev.current = { shown, e8: live };
    const t = setTimeout(() => setDir(""), 700);
    return () => clearTimeout(t);
  }, [shown, live]);

  return (
    <tr className="group border-b border-bone/5 transition-colors last:border-0 hover:bg-bone/[0.02] [&>td]:px-4 [&>td]:py-3.5">
      <td>
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-soil-800 text-base">
            {meta.glyph}
          </span>
          <div>
            <div className="font-medium leading-tight">{prettyName(m.symbol)}</div>
            <div className="tnum text-xs text-bone/40">
              {m.symbol} · /{m.unit}
            </div>
          </div>
        </div>
      </td>
      <td>
        <span className="label rounded-full border border-bone/15 px-2 py-0.5 text-bone/55">
          {meta.group}
        </span>
      </td>
      <td className="text-right">
        {m.stale ? (
          <span className="label rounded-full bg-wheat/10 px-2 py-0.5 text-wheat/90">stale</span>
        ) : (
          <span
            className={
              "tnum text-[0.95rem] transition-colors duration-300 " +
              (dir === "up" ? "text-field" : dir === "down" ? "text-rust" : "")
            }
          >
            {shown}
          </span>
        )}
      </td>
      <td>
        <div className="flex justify-center text-bone/50">
          <Sparkline values={values} />
        </div>
      </td>
      <td className="tnum text-right text-bone/60">{m.maxLeverageX}×</td>
      <td className="tnum text-right text-xs text-bone/55">
        <span className="text-field">{formatETH(m.longOI)}</span>
        <span className="text-bone/25"> / </span>
        <span className="text-rust">{formatETH(m.shortOI)}</span>
      </td>
      <td className="text-right">
        {m.stale ? (
          <span className="cursor-not-allowed rounded-full bg-bone/10 px-4 py-1.5 text-xs font-semibold text-bone/30">
            Trade
          </span>
        ) : (
          <Link
            href={`/trade/${m.symbol}`}
            className="rounded-full bg-bone/10 px-4 py-1.5 text-xs font-semibold text-bone transition-colors hover:bg-wheat hover:text-soil-950"
          >
            Trade
          </Link>
        )}
      </td>
    </tr>
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
      className={
        "rounded-full px-3.5 py-1.5 text-sm transition-colors " +
        (active
          ? "bg-wheat text-soil-950"
          : "border border-bone/10 text-bone/55 hover:border-bone/25 hover:text-bone/80")
      }
    >
      {children}
    </button>
  );
}
