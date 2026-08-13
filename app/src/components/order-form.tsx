"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { type MarketInfo } from "@/hooks/use-markets";
import { perpEngineAbi, ENGINE_ADDRESS } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { formatUsdPrice } from "@/lib/format";
import { Spinner } from "./spinner";

/** Docked order form for the trade terminal. Stays put after a fill (unlike the old modal). */
export function OrderForm({ market }: { market: MarketInfo }) {
  const { isConnected } = useAccount();
  const [isLong, setIsLong] = useState(true);
  const [leverage, setLeverage] = useState(2);
  const [margin, setMargin] = useState("0.001");
  const [slippagePct, setSlippagePct] = useState(1);

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isSuccess) return;
    queryClient.invalidateQueries();
    const t = setTimeout(() => reset(), 2500); // clear "Opened ✓" but stay on the terminal
    return () => clearTimeout(t);
  }, [isSuccess, queryClient, reset]);

  const marginNum = Number(margin);
  const valid = marginNum > 0 && Number.isFinite(marginNum);
  const entryUsd = Number(market.priceE8) / 1e8;
  const notional = marginNum * leverage;
  const openFee = (notional * market.openFeeBps) / 10_000;
  const collateral = marginNum - openFee;
  const maintenance = (notional * market.maintenanceMarginBps) / 10_000;
  const move = notional > 0 ? (collateral - maintenance) / notional : 0;
  const liqUsd = isLong ? entryUsd * (1 - move) : entryUsd * (1 + move);
  const busy = isPending || confirming;

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
    <div className="rounded-2xl border border-bone/10 bg-soil-900/60 p-5">
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Side active={isLong} onClick={() => setIsLong(true)} label="Long" tone="field" />
        <Side active={!isLong} onClick={() => setIsLong(false)} label="Short" tone="rust" />
      </div>

      <label className="label text-bone/40">Margin</label>
      <div className="mb-4 mt-1.5 flex items-center rounded-xl border border-bone/10 bg-soil-950/60 px-3 focus-within:border-wheat/40">
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
          {leverage}× <span className="text-bone/30">/ {market.maxLeverageX}×</span>
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={market.maxLeverageX || 1}
        value={leverage}
        onChange={(e) => setLeverage(Number(e.target.value))}
        className="mb-4 w-full"
      />

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
        className="mb-4 w-full"
      />

      <div className="mb-4 space-y-2 rounded-xl border border-bone/10 bg-soil-950/40 p-3.5">
        <Row label="Notional" value={`${notional.toFixed(4)} ETH`} />
        <Row label="Collateral" value={`${collateral.toFixed(5)} ETH`} />
        <Row label="Open fee" value={`${openFee.toFixed(6)} ETH`} sub />
        <Row
          label="Est. liquidation"
          value={liqUsd > 0 ? formatUsdPrice(BigInt(Math.round(liqUsd * 1e8))) : "-"}
          tone={isLong ? "field" : "rust"}
        />
      </div>

      <button
        disabled={!isConnected || !valid || busy}
        onClick={submit}
        className={
          "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-soil-950 transition-colors disabled:opacity-40 " +
          (isLong ? "bg-field hover:bg-field/90" : "bg-rust hover:bg-rust/90")
        }
      >
        {busy && <Spinner className="h-4 w-4" />}
        {!isConnected
          ? "Connect wallet"
          : isPending
            ? "Confirm in wallet…"
            : confirming
              ? "Opening…"
              : isSuccess
                ? "Opened ✓"
                : `Open ${isLong ? "long" : "short"} · ${leverage}×`}
      </button>
      {error && <p className="mt-2 break-words text-xs text-rust">{error.message.slice(0, 140)}</p>}
      <p className="mt-3 text-[0.7rem] leading-snug text-bone/35">
        Funding + a utilization borrow fee accrue while open. Liquidation is an estimate excluding carry.
      </p>
    </div>
  );
}

function Side({ active, onClick, label, tone }: { active: boolean; onClick: () => void; label: string; tone: "field" | "rust" }) {
  const cls = tone === "field" ? "bg-field text-soil-950" : "bg-rust text-soil-950";
  return (
    <button
      onClick={onClick}
      className={"rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors " + (active ? cls : "border border-bone/10 text-bone/50 hover:text-bone/80")}
    >
      {label}
    </button>
  );
}

function Row({ label, value, sub, tone }: { label: string; value: string; sub?: boolean; tone?: "field" | "rust" }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={sub ? "text-bone/40" : "text-bone/60"}>{label}</span>
      <span className={"tnum " + (tone === "field" ? "text-field" : tone === "rust" ? "text-rust" : "text-bone/90")}>{value}</span>
    </div>
  );
}
