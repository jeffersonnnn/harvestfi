"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { predictionMarketAbi, PREDICTION_MARKET_ADDRESS } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { formatETH, formatUsdPrice } from "@/lib/format";
import { prettyName } from "@/lib/commodities-meta";
import { type PredictionInfo, type Phase, estimatePayout } from "@/hooks/use-predictions";

const NOMINAL = 1_000_000_000_000_000n; // 0.001 ETH, used for the idle "pays N×" estimate

const PHASE_ORDER: Phase[] = ["open", "awaiting", "resolved", "cancelled"];
const PHASE_LABEL: Record<Phase, string> = {
  open: "Open",
  awaiting: "Awaiting settlement",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

export function PredictBoard({
  predictions,
  feeBps,
  bettorsByMarket,
  refetch,
}: {
  predictions: PredictionInfo[];
  feeBps: number;
  bettorsByMarket?: Map<number, number>;
  refetch: () => void;
}) {
  const groups = useMemo(() => {
    const g: Record<Phase, PredictionInfo[]> = { open: [], awaiting: [], resolved: [], cancelled: [] };
    for (const p of predictions) g[p.phase].push(p);
    return g;
  }, [predictions]);

  if (predictions.length === 0) {
    return (
      <div className="rounded-2xl border border-bone/10 bg-soil-900/50 p-8 text-center text-bone/55">
        No markets yet. The first prediction market is on its way.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {PHASE_ORDER.map((phase) =>
        groups[phase].length === 0 ? null : (
          <section key={phase} className="space-y-3">
            <h2 className="label text-bone/45">
              {PHASE_LABEL[phase]} · {groups[phase].length}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {groups[phase].map((p) => (
                <PredictionCard
                  key={p.id}
                  p={p}
                  feeBps={feeBps}
                  bettors={bettorsByMarket?.get(p.id) ?? 0}
                  refetch={refetch}
                />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}

function useCountdown(target: number): string {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const s = target - now;
  if (s <= 0) return "expired";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function PredictionCard({
  p,
  feeBps,
  bettors,
  refetch,
}: {
  p: PredictionInfo;
  feeBps: number;
  bettors: number;
  refetch: () => void;
}) {
  const { isConnected } = useAccount();
  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const countdown = useCountdown(p.expiry);

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      refetch();
      setAmount("");
      reset();
    }
  }, [isSuccess, queryClient, refetch, reset]);

  const busy = isPending || confirming;
  const yesPct = p.yesBps === 0 && p.noBps === 0 ? 50 : Math.round(p.yesBps / 100);
  const noPct = 100 - yesPct;
  const totalPool = p.yesPool + p.noPool;
  const dir = p.isAbove ? "above" : "below";
  const question = `Will ${prettyName(p.symbol)} be ${dir} ${formatUsdPrice(p.thresholdE8)} at close?`;

  // Estimated payout for the entered amount (or a nominal 0.001 ETH when idle) — the "pays N×" number.
  let stake = NOMINAL;
  let entered = false;
  try {
    if (amount.trim()) {
      stake = parseEther(amount.trim());
      entered = stake > 0n;
    }
  } catch {
    /* ignore parse errors here; validated on submit */
  }
  const estY = estimatePayout(p, true, stake > 0n ? stake : NOMINAL, feeBps);
  const estN = estimatePayout(p, false, stake > 0n ? stake : NOMINAL, feeBps);

  function placeBet(isYes: boolean) {
    setErr("");
    let wei: bigint;
    try {
      wei = parseEther(amount.trim());
    } catch {
      setErr("Enter a valid ETH amount");
      return;
    }
    if (wei <= 0n) {
      setErr("Amount must be above 0");
      return;
    }
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "bet",
      args: [BigInt(p.id), isYes],
      value: wei,
      chainId: CHAIN_ID,
    });
  }
  function doResolve() {
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "resolve",
      args: [BigInt(p.id)],
      chainId: CHAIN_ID,
    });
  }
  function doClaim() {
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "claim",
      args: [BigInt(p.id)],
      chainId: CHAIN_ID,
    });
  }

  return (
    <div className="rounded-2xl border border-bone/10 bg-soil-900/50 p-5">
      {/* header */}
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-wheat/10 text-2xl">{p.glyph}</span>
        <div className="min-w-0">
          <p className="label text-bone/45">
            {p.symbol} · #{p.id}
          </p>
          <p className="font-mono text-xs text-bone/45">
            {p.currentPriceE8 > 0n ? `now ${formatUsdPrice(p.currentPriceE8)}` : "price pending"}
          </p>
        </div>
        <StatusChip p={p} countdown={countdown} />
      </div>

      <h3 className="mt-3 font-display text-xl font-medium leading-snug tracking-tight">{question}</h3>

      {/* probability bar (hero) */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between font-mono text-sm">
          <span className="font-bold text-field">YES {yesPct}%</span>
          <span className="font-bold text-rust">{noPct}% NO</span>
        </div>
        <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-rust/25">
          <div className="h-full bg-field" style={{ width: `${yesPct}%` }} />
        </div>
      </div>

      {/* meta row */}
      <p className="mt-2.5 font-mono text-xs text-bone/45">
        pot {formatETH(totalPool)} ETH
        {bettors > 0 && ` · ${bettors} bettor${bettors === 1 ? "" : "s"}`}
        {" · "}
        <span className="text-bone/60">
          pays YES {estY.multipleX.toFixed(2)}× / NO {estN.multipleX.toFixed(2)}×
        </span>
      </p>

      {/* your position */}
      {(p.myYes > 0n || p.myNo > 0n) && (
        <p className="mt-3 rounded-lg border border-bone/10 bg-soil-950/40 px-3 py-2 font-mono text-xs text-bone/60">
          You:{" "}
          {p.myYes > 0n && <span className="text-field">YES {formatETH(p.myYes)} ETH</span>}
          {p.myYes > 0n && p.myNo > 0n && " · "}
          {p.myNo > 0n && <span className="text-rust">NO {formatETH(p.myNo)} ETH</span>}
        </p>
      )}

      {/* actions */}
      <div className="mt-4">
        {p.phase === "open" && (
          <div className="space-y-2">
            <input
              inputMode="decimal"
              placeholder="Amount in ETH"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-bone/15 bg-soil-950/60 px-3 py-2 font-mono text-sm outline-none focus:border-wheat/40"
            />
            {entered && (
              <p className="font-mono text-xs text-bone/55">
                ≈ <span className="text-field">{formatETH(estY.payout)} ETH</span> if YES (+
                {((estY.multipleX - 1) * 100).toFixed(0)}%) ·{" "}
                <span className="text-rust">{formatETH(estN.payout)} ETH</span> if NO (+
                {((estN.multipleX - 1) * 100).toFixed(0)}%)
                <span className="text-bone/35"> — estimate, moves with the pool</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={!isConnected || busy}
                onClick={() => placeBet(true)}
                className="rounded-lg bg-field/90 px-3 py-2.5 text-sm font-semibold text-soil-950 transition-colors hover:bg-field disabled:opacity-40"
              >
                {busy ? "…" : `Bet YES · ${estY.multipleX.toFixed(2)}×`}
              </button>
              <button
                disabled={!isConnected || busy}
                onClick={() => placeBet(false)}
                className="rounded-lg bg-rust/90 px-3 py-2.5 text-sm font-semibold text-bone transition-colors hover:bg-rust disabled:opacity-40"
              >
                {busy ? "…" : `Bet NO · ${estN.multipleX.toFixed(2)}×`}
              </button>
            </div>
            {!isConnected && <p className="text-xs text-bone/40">Connect a wallet to bet.</p>}
            {err && <p className="text-xs text-rust">{err}</p>}
          </div>
        )}

        {p.phase === "awaiting" && (
          <div className="space-y-2">
            <p className="text-sm text-bone/55">
              Betting closed. Settles from the oracle&apos;s post-expiry price.
            </p>
            <button
              disabled={busy}
              onClick={doResolve}
              className="w-full rounded-lg border border-wheat/30 bg-wheat/10 px-3 py-2.5 text-sm font-semibold text-wheat transition-colors hover:bg-wheat/20 disabled:opacity-40"
            >
              {busy ? "Resolving…" : "Resolve now"}
            </button>
          </div>
        )}

        {p.phase === "resolved" && <ResolvedActions p={p} busy={busy} onClaim={doClaim} />}

        {p.phase === "cancelled" && (
          <div className="space-y-2">
            <p className="text-sm text-bone/55">
              Cancelled (no valid settlement price). Your full stake is refundable.
            </p>
            {p.myClaimable > 0n && (
              <button
                disabled={busy}
                onClick={doClaim}
                className="w-full rounded-lg bg-wheat px-3 py-2.5 text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90 disabled:opacity-40"
              >
                {busy ? "…" : `Refund ${formatETH(p.myClaimable)} ETH`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResolvedActions({ p, busy, onClaim }: { p: PredictionInfo; busy: boolean; onClaim: () => void }) {
  const won = p.outcomeYes ? "YES" : "NO";
  return (
    <div className="space-y-2">
      <p className="text-sm text-bone/60">
        <span className={p.outcomeYes ? "text-field" : "text-rust"}>{won} won</span> · settled at{" "}
        {formatUsdPrice(p.resolvedPrice)}
      </p>
      {p.myClaimable > 0n ? (
        <button
          disabled={busy}
          onClick={onClaim}
          className="w-full rounded-lg bg-field px-3 py-2.5 text-sm font-semibold text-soil-950 transition-colors hover:bg-field/90 disabled:opacity-40"
        >
          {busy ? "…" : `Claim ${formatETH(p.myClaimable)} ETH`}
        </button>
      ) : p.myYes > 0n || p.myNo > 0n ? (
        <p className="text-xs text-bone/40">No winnings on this market.</p>
      ) : null}
    </div>
  );
}

function StatusChip({ p, countdown }: { p: PredictionInfo; countdown: string }) {
  const cls =
    p.phase === "open"
      ? "border-field/40 bg-field/10 text-field"
      : p.phase === "awaiting"
        ? "border-wheat/40 bg-wheat/10 text-wheat"
        : p.phase === "resolved"
          ? "border-bone/20 bg-bone/5 text-bone/60"
          : "border-rust/40 bg-rust/10 text-rust";
  const text =
    p.phase === "open" ? `closes in ${countdown}` : p.phase === "awaiting" ? "awaiting" : p.phase;
  return (
    <span className={"ml-auto shrink-0 rounded-full border px-2.5 py-1 font-mono text-[0.68rem] " + cls}>
      {text}
    </span>
  );
}
