"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { type MarketInfo } from "@/hooks/use-markets";
import { perpEngineAbi, ENGINE_ADDRESS } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { formatUsdPrice } from "@/lib/format";
import { marketMeta, prettyName } from "@/lib/commodities-meta";

export function TradePanel({ market, onClose }: { market: MarketInfo; onClose: () => void }) {
  const { isConnected } = useAccount();
  const [isLong, setIsLong] = useState(true);
  const [leverage, setLeverage] = useState(2);
  const [margin, setMargin] = useState("0.01");
  const [slippagePct, setSlippagePct] = useState(1);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const queryClient = useQueryClient();
  useEffect(() => {
    if (isSuccess) queryClient.invalidateQueries();
  }, [isSuccess, queryClient]);

  const marginNum = Number(margin);
  const valid = marginNum > 0 && Number.isFinite(marginNum);
  const entryUsd = Number(market.priceE8) / 1e8;
  const notional = marginNum * leverage;
  const openFee = (notional * market.openFeeBps) / 10_000;
  const collateral = marginNum - openFee;
  const maintenance = (notional * market.maintenanceMarginBps) / 10_000;
  const move = notional > 0 ? (collateral - maintenance) / notional : 0;
  const liqUsd = isLong ? entryUsd * (1 - move) : entryUsd * (1 + move);
  const meta = marketMeta(market.symbol);

  function submit() {
    if (!valid) return;
    const slipBps = BigInt(Math.round(slippagePct * 100));
    const bound =
      slippagePct <= 0
        ? 0n
        : isLong
          ? (market.priceE8 * (10_000n + slipBps)) / 10_000n
          : (market.priceE8 * (10_000n - slipBps)) / 10_000n;
    writeContract({
      address: ENGINE_ADDRESS,
      abi: perpEngineAbi,
      functionName: "openPosition",
      args: [BigInt(market.id), isLong, leverage, bound],
      value: parseEther(margin),
      chainId: CHAIN_ID,
    });
  }

  const tone = isLong ? "field" : "rust";
  const busy = isPending || confirming;

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
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-soil-800 text-lg">
              {meta.glyph}
            </span>
            <div>
              <h3 className="font-display text-lg font-medium leading-tight">
                {prettyName(market.symbol)}
              </h3>
              <div className="tnum text-sm text-bone/50">
                {formatUsdPrice(market.priceE8)} <span className="text-bone/30">/ {market.unit}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-bone/40 hover:text-bone">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Side */}
        <div className="mb-5 grid grid-cols-2 gap-2">
          <SideButton active={isLong} onClick={() => setIsLong(true)} label="Long" tone="field" />
          <SideButton active={!isLong} onClick={() => setIsLong(false)} label="Short" tone="rust" />
        </div>

        {/* Margin */}
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

        {/* Leverage */}
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

        {/* Slippage */}
        <div className="mb-1.5 flex items-center justify-between">
          <label className="label text-bone/40">Max slippage</label>
          <span className="tnum text-sm text-bone/70">{slippagePct}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={5}
          step={0.5}
          value={slippagePct}
          onChange={(e) => setSlippagePct(Number(e.target.value))}
          className="mb-5 w-full"
        />

        {/* Preview */}
        <div className="mb-5 space-y-2 rounded-xl border border-bone/10 bg-soil-950/40 p-3.5">
          <Row label="Notional" value={`${notional.toFixed(4)} ETH`} />
          <Row label="Collateral (after fee)" value={`${collateral.toFixed(5)} ETH`} />
          <Row label="Open fee" value={`${openFee.toFixed(6)} ETH`} sub />
          <Row
            label="Est. liquidation"
            value={liqUsd > 0 ? formatUsdPrice(BigInt(Math.round(liqUsd * 1e8))) : "—"}
            tone={tone}
          />
          <p className="pt-1 text-[0.7rem] leading-snug text-bone/35">
            Funding + a utilization borrow fee accrue while the position is open. Liquidation is an
            estimate and excludes those carry costs.
          </p>
        </div>

        <button
          disabled={!isConnected || !valid || busy}
          onClick={submit}
          className={
            "w-full rounded-xl px-4 py-3 text-sm font-semibold text-soil-950 transition-colors disabled:opacity-40 " +
            (isLong ? "bg-field hover:bg-field/90" : "bg-rust hover:bg-rust/90")
          }
        >
          {!isConnected
            ? "Connect wallet"
            : isPending
              ? "Confirm in wallet…"
              : confirming
                ? "Opening position…"
                : isSuccess
                  ? "Opened ✓"
                  : `Open ${isLong ? "long" : "short"} · ${leverage}×`}
        </button>
        {error && (
          <p className="mt-2 break-words text-xs text-rust">{error.message.slice(0, 140)}</p>
        )}
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
        className={
          "tnum " +
          (tone === "field" ? "text-field" : tone === "rust" ? "text-rust" : "text-bone/90")
        }
      >
        {value}
      </span>
    </div>
  );
}
