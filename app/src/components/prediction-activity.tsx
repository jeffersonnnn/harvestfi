"use client";

import { formatETH, truncateAddress } from "@/lib/format";
import { prettyName } from "@/lib/commodities-meta";
import { type PredictionInfo } from "@/hooks/use-predictions";
import { type PredictionActivity as ActivityData } from "@/hooks/use-prediction-activity";

export function PredictionActivity({
  data,
  predictions,
}: {
  data: ActivityData;
  predictions: PredictionInfo[];
}) {
  const bySymbol = new Map(predictions.map((p) => [p.id, p]));
  const openCount = predictions.filter((p) => p.phase === "open").length;

  return (
    <div className="rounded-2xl border border-bone/10 bg-soil-900/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="label text-wheat">Market activity</span>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Stat k="Volume" v={`${formatETH(data.volume)} ETH`} gold />
          <Stat k="Bets" v={String(data.betCount)} />
          <Stat k="Bettors" v={String(data.bettors)} />
          <Stat k="Open" v={String(openCount)} />
        </div>
      </div>

      {data.events.length > 0 ? (
        <div className="mt-4 divide-y divide-bone/5">
          {data.events.map((e, i) => {
            const p = bySymbol.get(e.marketId);
            const glyph = p?.glyph ?? "•";
            const name = p ? prettyName(p.symbol) : `#${e.marketId}`;
            return (
              <div key={e.txHash + i} className="flex items-center gap-3 py-2.5 font-mono text-sm">
                <span className="text-lg">{glyph}</span>
                <span className="text-bone/80">{name}</span>
                {e.kind === "bet" ? (
                  <>
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-[0.7rem] font-semibold " +
                        (e.isYes ? "bg-field/15 text-field" : "bg-rust/15 text-rust")
                      }
                    >
                      {e.isYes ? "YES" : "NO"}
                    </span>
                    <span className="text-bone/60">{formatETH(e.amount)} ETH</span>
                    <span className="ml-auto text-xs text-bone/40">{truncateAddress(e.who)}</span>
                  </>
                ) : (
                  <>
                    <span className="rounded bg-bone/10 px-1.5 py-0.5 text-[0.7rem] font-semibold text-bone/70">
                      resolved {e.isYes ? "YES" : "NO"}
                    </span>
                    <span className="ml-auto text-xs text-bone/40">settled</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-bone/45">
          {data.loading ? "Loading activity…" : "No bets yet. Be the first to open a position."}
        </p>
      )}
    </div>
  );
}

function Stat({ k, v, gold }: { k: string; v: string; gold?: boolean }) {
  return (
    <div className="text-right">
      <div className="label text-bone/40">{k}</div>
      <div className={"font-mono text-lg " + (gold ? "text-wheat" : "text-bone")}>{v}</div>
    </div>
  );
}
