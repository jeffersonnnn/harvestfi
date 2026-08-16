"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { X } from "lucide-react";
import { useMarkets, type MarketInfo } from "@/hooks/use-markets";
import { formatUsdPrice, formatETH } from "@/lib/format";
import { marketMeta, prettyName } from "@/lib/commodities-meta";
import { PnlCardModal, type PnlCardData } from "@/components/pnl-card";
import {
  loadDemo,
  saveDemo,
  resetDemo,
  demoPnl,
  demoClose,
  type DemoState,
  type DemoPosition,
} from "@/lib/demo";

interface CloseResult {
  symbol: string;
  pnl: bigint;
  payout: bigint;
  card: PnlCardData;
}

export function DemoDesk() {
  const { markets, isLoading } = useMarkets();
  const [state, setState] = useState<DemoState | null>(null); // null until hydrated (SSR-safe)
  const [opening, setOpening] = useState<MarketInfo | null>(null);
  const [result, setResult] = useState<CloseResult | null>(null);
  const [card, setCard] = useState<PnlCardData | null>(null);
  // Re-render on a timer so open uPnL tracks the live mark between price refetches.
  const [, setTick] = useState(0);

  useEffect(() => setState(loadDemo()), []);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, []);

  function commit(next: DemoState) {
    saveDemo(next);
    setState(next);
  }

  const marketOf = (id: number) => markets.find((m) => m.id === id);

  function openPosition(market: MarketInfo, isLong: boolean, marginEth: string, leverage: number) {
    if (!state) return;
    const marginWei = parseEther(marginEth);
    if (marginWei <= 0n || marginWei > BigInt(state.balanceWei)) return;
    const sizeWei = marginWei * BigInt(leverage);
    const openFeeWei = (sizeWei * BigInt(market.openFeeBps)) / 10_000n;
    const collateralWei = marginWei - openFeeWei;
    const pos: DemoPosition = {
      id: state.nextId,
      symbol: market.symbol,
      commodityId: market.id,
      isLong,
      leverage,
      collateralWei: collateralWei.toString(),
      sizeWei: sizeWei.toString(),
      entryPriceE8: market.priceE8.toString(),
      openedAt: Date.now(),
    };
    commit({
      ...state,
      balanceWei: (BigInt(state.balanceWei) - marginWei).toString(),
      positions: [...state.positions, pos],
      nextId: state.nextId + 1,
    });
    setOpening(null);
  }

  function closePosition(p: DemoPosition) {
    if (!state) return;
    const m = marketOf(p.commodityId);
    const markE8 = m?.priceE8 ?? BigInt(p.entryPriceE8);
    const closeFeeBps = m?.closeFeeBps ?? 0;
    const { pnlWei, payoutWei } = demoClose(p, markE8, closeFeeBps);
    const collateral = BigInt(p.collateralWei);
    const built: PnlCardData = {
      symbol: p.symbol,
      unit: m?.unit,
      isLong: p.isLong,
      leverageX: collateral > 0n ? Number(BigInt(p.sizeWei)) / Number(collateral) : p.leverage,
      entryPrice: BigInt(p.entryPriceE8),
      exitPrice: markE8,
      pnlEth: pnlWei,
      pnlPct: collateral > 0n ? (Number(pnlWei) / Number(collateral)) * 100 : 0,
      realized: true,
    };
    commit({
      ...state,
      balanceWei: (BigInt(state.balanceWei) + payoutWei).toString(),
      positions: state.positions.filter((x) => x.id !== p.id),
      trades: state.trades + 1,
      wins: state.wins + (pnlWei >= 0n ? 1 : 0),
    });
    setResult({ symbol: p.symbol, pnl: pnlWei, payout: payoutWei, card: built });
  }

  function liveCard(p: DemoPosition): PnlCardData {
    const m = marketOf(p.commodityId);
    const markE8 = m?.priceE8 ?? BigInt(p.entryPriceE8);
    const pnl = demoPnl(p, markE8);
    const collateral = BigInt(p.collateralWei);
    return {
      symbol: p.symbol,
      unit: m?.unit,
      isLong: p.isLong,
      leverageX: collateral > 0n ? Number(BigInt(p.sizeWei)) / Number(collateral) : p.leverage,
      entryPrice: BigInt(p.entryPriceE8),
      exitPrice: markE8,
      pnlEth: pnl,
      pnlPct: collateral > 0n ? (Number(pnl) / Number(collateral)) * 100 : 0,
      realized: false,
    };
  }

  if (!state) return <p className="text-sm text-bone/40">Loading demo…</p>;

  const balance = BigInt(state.balanceWei);
  const tradeable = markets.filter((m) => !m.stale && m.priceE8 > 0n);

  return (
    <div className="space-y-8">
      {/* Balance strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-wheat/20 bg-wheat/5 px-5 py-4">
        <div>
          <div className="label text-bone/40">Demo balance</div>
          <div className="tnum mt-1 text-2xl font-semibold text-wheat">{formatETH(balance)} ETH</div>
          <div className="mt-1 text-xs text-bone/40">
            {state.trades} closed · {state.wins} wins · fake money, no wallet needed
          </div>
        </div>
        <button
          onClick={() => setState(resetDemo())}
          className="rounded-full border border-bone/15 px-4 py-2 text-xs text-bone/60 hover:bg-bone/10"
        >
          Reset demo
        </button>
      </div>

      {result && (
        <ResultBanner
          result={result}
          onShare={() => setCard(result.card)}
          onDismiss={() => setResult(null)}
        />
      )}
      {card && <PnlCardModal data={card} onClose={() => setCard(null)} />}
      {opening && (
        <DemoOpenModal
          market={opening}
          maxWei={balance}
          onClose={() => setOpening(null)}
          onOpen={openPosition}
        />
      )}

      {/* Open positions */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-bone/50">Your demo positions</h2>
        {state.positions.length === 0 ? (
          <p className="text-sm text-bone/40">No open positions. Pick a market below to open one.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-bone/10">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-bone/40">
                <tr className="[&>th]:px-4 [&>th]:py-3">
                  <th>Market</th>
                  <th>Side</th>
                  <th className="text-right">Size</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Mark</th>
                  <th className="text-right">uPnL</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bone/5">
                {state.positions.map((p) => {
                  const m = marketOf(p.commodityId);
                  const markE8 = m?.priceE8 ?? BigInt(p.entryPriceE8);
                  const pnl = demoPnl(p, markE8);
                  const pos = pnl >= 0n;
                  return (
                    <tr key={p.id} className="[&>td]:px-4 [&>td]:py-3">
                      <td className="font-medium">{prettyName(p.symbol)}</td>
                      <td className={p.isLong ? "text-field" : "text-rust"}>
                        {p.isLong ? "Long" : "Short"} · {p.leverage}×
                      </td>
                      <td className="tnum text-right text-bone/70">{formatETH(BigInt(p.sizeWei))} ETH</td>
                      <td className="tnum text-right text-bone/70">{formatUsdPrice(BigInt(p.entryPriceE8))}</td>
                      <td className="tnum text-right text-bone/70">{formatUsdPrice(markE8)}</td>
                      <td className={"tnum text-right " + (pos ? "text-field" : "text-rust")}>
                        {pos ? "+" : ""}
                        {formatETH(pnl, 6)}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setCard(liveCard(p))}
                            className="rounded-full border border-bone/15 px-3 py-1.5 text-xs hover:bg-bone/10"
                          >
                            Card
                          </button>
                          <button
                            onClick={() => closePosition(p)}
                            className="rounded-full border border-bone/15 px-4 py-1.5 text-xs hover:bg-bone/10"
                          >
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Market picker */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-bone/50">Markets</h2>
        {isLoading ? (
          <p className="text-sm text-bone/40">Loading markets…</p>
        ) : tradeable.length === 0 ? (
          <p className="text-sm text-bone/40">No live prices right now. Try again shortly.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tradeable.map((m) => {
              const meta = marketMeta(m.symbol);
              return (
                <button
                  key={m.id}
                  onClick={() => setOpening(m)}
                  className="flex items-center justify-between rounded-xl border border-bone/10 bg-bone/[0.02] px-4 py-3 text-left transition-colors hover:border-wheat/30 hover:bg-wheat/5"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-soil-800 text-base">
                      {meta.glyph}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{prettyName(m.symbol)}</span>
                      <span className="tnum block text-xs text-bone/40">{formatUsdPrice(m.priceE8)}</span>
                    </span>
                  </span>
                  <span className="text-xs text-bone/40">Trade →</span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function DemoOpenModal({
  market,
  maxWei,
  onClose,
  onOpen,
}: {
  market: MarketInfo;
  maxWei: bigint;
  onClose: () => void;
  onOpen: (m: MarketInfo, isLong: boolean, marginEth: string, leverage: number) => void;
}) {
  const [isLong, setIsLong] = useState(true);
  const [leverage, setLeverage] = useState(2);
  const [margin, setMargin] = useState("0.05");

  const marginNum = Number(margin);
  const valid = marginNum > 0 && Number.isFinite(marginNum) && parseEther(margin || "0") <= maxWei;
  const entryUsd = Number(market.priceE8) / 1e8;
  const notional = marginNum * leverage;
  const openFee = (notional * market.openFeeBps) / 10_000;
  const collateral = marginNum - openFee;
  const maintenance = (notional * market.maintenanceMarginBps) / 10_000;
  const move = notional > 0 ? (collateral - maintenance) / notional : 0;
  const liqUsd = isLong ? entryUsd * (1 - move) : entryUsd * (1 + move);
  const meta = marketMeta(market.symbol);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-soil-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-bone/10 bg-soil-900 p-6"
        role="dialog"
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-soil-800 text-lg">{meta.glyph}</span>
            <div>
              <h3 className="font-display text-lg font-medium leading-tight">{prettyName(market.symbol)}</h3>
              <div className="tnum text-sm text-bone/50">
                {formatUsdPrice(market.priceE8)} <span className="text-bone/30">/ {market.unit}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-bone/40 hover:text-bone">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          <SideButton active={isLong} onClick={() => setIsLong(true)} label="Long" tone="field" />
          <SideButton active={!isLong} onClick={() => setIsLong(false)} label="Short" tone="rust" />
        </div>

        <label className="label text-bone/40">Margin</label>
        <div className="mb-5 mt-1.5 flex items-center rounded-xl border border-bone/10 bg-soil-950/60 px-3 focus-within:border-wheat/40">
          <input
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            inputMode="decimal"
            className="tnum w-full bg-transparent py-2.5 text-sm outline-none"
          />
          <span className="text-sm text-bone/40">ETH</span>
        </div>

        <div className="mb-1.5 flex items-center justify-between">
          <label className="label text-bone/40">Leverage</label>
          <span className="tnum text-sm text-bone/70">
            {leverage}× <span className="text-bone/30">/ {market.maxLeverageX}× max</span>
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={market.maxLeverageX || 1}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="mb-5 w-full"
        />

        <div className="mb-5 space-y-2 rounded-xl border border-bone/10 bg-soil-950/40 p-3.5">
          <Row label="Notional" value={`${notional.toFixed(4)} ETH`} />
          <Row label="Collateral (after fee)" value={`${collateral.toFixed(5)} ETH`} />
          <Row label="Open fee" value={`${openFee.toFixed(6)} ETH`} sub />
          <Row
            label="Est. liquidation"
            value={liqUsd > 0 ? formatUsdPrice(BigInt(Math.round(liqUsd * 1e8))) : "-"}
            tone={isLong ? "field" : "rust"}
          />
          <p className="pt-1 text-[0.7rem] leading-snug text-bone/35">
            Paper trade — fake ETH, live prices. Carry costs (funding + borrow fee) are excluded from
            this estimate.
          </p>
        </div>

        <button
          disabled={!valid}
          onClick={() => onOpen(market, isLong, margin, leverage)}
          className={
            "w-full rounded-xl px-4 py-3 text-sm font-semibold text-soil-950 transition-colors disabled:opacity-40 " +
            (isLong ? "bg-field hover:bg-field/90" : "bg-rust hover:bg-rust/90")
          }
        >
          {valid ? `Open demo ${isLong ? "long" : "short"} · ${leverage}×` : "Not enough demo balance"}
        </button>
      </div>
    </div>
  );
}

function SideButton({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone: "field" | "rust";
}) {
  const activeCls = tone === "field" ? "bg-field text-soil-950" : "bg-rust text-soil-950";
  return (
    <button
      onClick={onClick}
      className={
        "rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors " +
        (active ? activeCls : "border border-bone/10 text-bone/50 hover:text-bone/80")
      }
    >
      {label}
    </button>
  );
}

function Row({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: boolean;
  tone?: "field" | "rust";
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className={sub ? "text-bone/40" : "text-bone/60"}>{label}</span>
      <span
        className={"tnum " + (tone === "field" ? "text-field" : tone === "rust" ? "text-rust" : "text-bone/90")}
      >
        {value}
      </span>
    </div>
  );
}

function ResultBanner({
  result,
  onShare,
  onDismiss,
}: {
  result: CloseResult;
  onShare: () => void;
  onDismiss: () => void;
}) {
  const win = result.pnl >= 0n;
  return (
    <div
      className={
        "flex items-start justify-between rounded-2xl border px-5 py-4 " +
        (win ? "border-field/30 bg-field/10" : "border-rust/30 bg-rust/10")
      }
    >
      <div className="text-sm">
        <div className="font-medium">
          Closed {prettyName(result.symbol)} ·{" "}
          <span className={win ? "text-field" : "text-rust"}>{win ? "▲ Win" : "▼ Loss"}</span>
        </div>
        <div className="mt-1 text-bone/70">
          Realized PnL{" "}
          <span className={win ? "text-field" : "text-rust"}>
            {win ? "+" : ""}
            {formatETH(result.pnl, 6)} ETH
          </span>{" "}
          · <span className="font-medium">{formatETH(result.payout, 6)} ETH</span> back to demo balance
        </div>
      </div>
      <div className="ml-4 flex items-center gap-3">
        <button
          onClick={onShare}
          className={
            "rounded-full px-4 py-1.5 text-xs font-medium " +
            (win ? "bg-field text-soil-950 hover:bg-field/90" : "bg-bone/10 text-bone hover:bg-bone/20")
          }
        >
          {win ? "Share your win" : "Share card"}
        </button>
        <button onClick={onDismiss} className="text-bone/40 hover:text-bone" aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
