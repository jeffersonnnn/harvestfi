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

export function TradePanel({
  market,
  onClose,
}: {
  market: MarketInfo;
  onClose: () => void;
}) {
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
  // Approx liq price ignoring funding/borrow.
  const move = notional > 0 ? (collateral - maintenance) / notional : 0;
  const liqUsd = isLong ? entryUsd * (1 - move) : entryUsd * (1 + move);

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

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6"
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            Trade {market.symbol}{" "}
            <span className="text-white/40">· {formatUsdPrice(market.priceE8)}</span>
          </h3>
          <button onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <SideButton active={isLong} onClick={() => setIsLong(true)} label="Long" tone="green" />
          <SideButton active={!isLong} onClick={() => setIsLong(false)} label="Short" tone="red" />
        </div>

        <label className="text-xs text-white/40">Margin (ETH)</label>
        <input
          value={margin}
          onChange={(e) => setMargin(e.target.value)}
          inputMode="decimal"
          className="mb-4 mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
        />

        <label className="text-xs text-white/40">
          Leverage: {leverage}× (max {market.maxLeverageX}×)
        </label>
        <input
          type="range"
          min={1}
          max={market.maxLeverageX || 1}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="mb-4 mt-1 w-full accent-emerald-400"
        />

        <label className="text-xs text-white/40">Max slippage: {slippagePct}%</label>
        <input
          type="range"
          min={0}
          max={5}
          step={0.5}
          value={slippagePct}
          onChange={(e) => setSlippagePct(Number(e.target.value))}
          className="mb-4 mt-1 w-full accent-emerald-400"
        />

        <div className="mb-4 space-y-1 rounded-xl bg-white/[0.03] p-3 text-xs text-white/60">
          <Row label="Notional" value={`${notional.toFixed(4)} ETH`} />
          <Row label="Open fee" value={`${openFee.toFixed(6)} ETH`} />
          <Row label="Est. liq. price" value={liqUsd > 0 ? formatUsdPrice(BigInt(Math.round(liqUsd * 1e8))) : "—"} />
        </div>

        <button
          disabled={!isConnected || !valid || isPending || confirming}
          onClick={submit}
          className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-medium text-black hover:bg-emerald-300 disabled:opacity-40"
        >
          {!isConnected
            ? "Connect wallet"
            : isPending
              ? "Confirm in wallet…"
              : confirming
                ? "Opening…"
                : isSuccess
                  ? "Opened ✓"
                  : `Open ${isLong ? "long" : "short"}`}
        </button>
        {error && (
          <p className="mt-2 break-words text-xs text-red-400">
            {error.message.slice(0, 140)}
          </p>
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
  tone: "green" | "red";
}) {
  const activeCls = tone === "green" ? "bg-emerald-400 text-black" : "bg-red-400 text-black";
  return (
    <button
      onClick={onClick}
      className={
        "rounded-xl px-4 py-2 text-sm font-medium " +
        (active ? activeCls : "bg-white/5 text-white/60")
      }
    >
      {label}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-white/80">{value}</span>
    </div>
  );
}
