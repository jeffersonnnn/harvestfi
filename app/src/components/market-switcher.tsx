"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { type MarketInfo } from "@/hooks/use-markets";
import { marketMeta, prettyName } from "@/lib/commodities-meta";
import { formatUsdPrice } from "@/lib/format";

export function MarketSwitcher({ current, markets }: { current: MarketInfo; markets: MarketInfo[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const meta = marketMeta(current.symbol);
  const filtered = markets.filter(
    (m) => !q || m.symbol.toLowerCase().includes(q.toLowerCase()) || prettyName(m.symbol).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded-xl border border-bone/10 bg-soil-900/60 px-4 py-2.5 transition-colors hover:border-bone/25"
      >
        <span className="grid h-8 w-8 place-items-center rounded-md bg-soil-800 text-base">{meta.glyph}</span>
        <span className="font-display text-lg font-medium leading-none">{prettyName(current.symbol)}</span>
        <ChevronDown className="h-4 w-4 text-bone/40" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-bone/10 bg-soil-900 shadow-2xl shadow-black/40">
            <div className="relative border-b border-bone/10 p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bone/35" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search markets…"
                className="w-full rounded-lg bg-transparent py-2 pl-8 pr-2 text-sm outline-none placeholder:text-bone/35"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-1">
              {filtered.map((m) => {
                const mm = marketMeta(m.symbol);
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setOpen(false);
                      router.push(`/trade/${m.symbol}`);
                    }}
                    className={
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bone/5 " +
                      (m.id === current.id ? "bg-bone/5" : "")
                    }
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-soil-800 text-sm">{mm.glyph}</span>
                    <span className="flex-1 text-sm">{prettyName(m.symbol)}</span>
                    <span className="tnum text-xs text-bone/50">{m.stale ? "-" : formatUsdPrice(m.priceE8)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
