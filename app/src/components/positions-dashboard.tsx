"use client";

import { useEffect, useRef, useState } from "react";
import { parseEventLogs } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { usePositions, type PositionView } from "@/hooks/use-positions";
import { type MarketInfo } from "@/hooks/use-markets";
import { perpEngineAbi, ENGINE_ADDRESS } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { formatUsdPrice, formatETH } from "@/lib/format";
import { PnlCardModal, type PnlCardData } from "@/components/pnl-card";

const ZERO = "0x0000000000000000000000000000000000000000";

const leverageOf = (sizeEth: bigint, collateral: bigint) =>
  collateral > 0n ? Number(sizeEth) / Number(collateral) : 0;

const pnlPctOf = (pnl: bigint, collateral: bigint) =>
  collateral > 0n ? Number((pnl * 10000n) / collateral) / 100 : 0;

interface CloseResult {
  symbol: string;
  pnl: bigint; // signed realized PnL
  payout: bigint; // ETH returned to the trader
  liquidated: boolean;
  card: PnlCardData; // fully-built shareable card for this close
}

export function PositionsDashboard({ markets }: { markets: MarketInfo[] }) {
  const { address, isConnected } = useAccount();
  const { positions, isLoading } = usePositions();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const {
    data: receipt,
    isLoading: confirming,
    isSuccess,
  } = useWaitForTransactionReceipt({ hash });
  const queryClient = useQueryClient();
  const [result, setResult] = useState<CloseResult | null>(null);
  const [card, setCard] = useState<PnlCardData | null>(null);
  // Snapshot of the position being closed, captured at click time (it's gone from chain after close).
  const closingSnap = useRef<PositionView | null>(null);

  // Escrowed payout (only set if a direct push to the trader ever failed).
  const { data: owedData } = useReadContract({
    address: ENGINE_ADDRESS,
    abi: perpEngineAbi,
    functionName: "owed",
    args: [address ?? ZERO],
    query: { enabled: isConnected, refetchInterval: 12_000 },
  });
  const owed = (owedData as bigint | undefined) ?? 0n;

  const marketOf = (cid: number) => markets.find((m) => m.id === cid);
  const symbolOf = (cid: number) => marketOf(cid)?.symbol ?? `#${cid}`;

  // On a confirmed close, decode the on-chain PositionClosed event to show the realized outcome and
  // build the shareable card (merging the event with the pre-close position snapshot).
  useEffect(() => {
    if (!isSuccess || !receipt) return;
    try {
      const events = parseEventLogs({
        abi: perpEngineAbi,
        logs: receipt.logs,
        eventName: "PositionClosed",
      });
      if (events.length > 0) {
        const a = events[0].args as unknown as {
          commodityId: bigint;
          exitPrice: bigint;
          pnl: bigint;
          payout: bigint;
          liquidated: boolean;
        };
        const snap = closingSnap.current;
        const cid = Number(a.commodityId);
        const m = marketOf(cid);
        const collateral = snap?.collateral ?? 0n;
        setResult({
          symbol: symbolOf(cid),
          pnl: a.pnl,
          payout: a.payout,
          liquidated: a.liquidated,
          card: {
            symbol: symbolOf(cid),
            unit: m?.unit,
            isLong: snap?.isLong ?? true,
            leverageX: leverageOf(snap?.sizeEth ?? 0n, collateral),
            entryPrice: snap?.entryPrice ?? 0n,
            exitPrice: a.exitPrice,
            pnlEth: a.pnl,
            pnlPct: pnlPctOf(a.pnl, collateral),
            realized: true,
            liquidated: a.liquidated,
            handle: address,
          },
        });
      }
    } catch {
      /* non-close tx (e.g. redeem) — no banner */
    }
    closingSnap.current = null;
    queryClient.invalidateQueries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, receipt]);

  if (!isConnected) return null;

  function close(p: PositionView) {
    closingSnap.current = p; // remember it for the shareable card (chain state is gone after close)
    writeContract({
      address: ENGINE_ADDRESS,
      abi: perpEngineAbi,
      functionName: "closePosition",
      args: [p.id, 0n],
      chainId: CHAIN_ID,
    });
  }

  // A live (unrealized) card for an open position: exit = current mark, PnL = unrealized.
  function openCard(p: PositionView): PnlCardData | null {
    if (p.pnl === null) return null; // stale price — no meaningful card
    const m = marketOf(p.commodityId);
    return {
      symbol: symbolOf(p.commodityId),
      unit: m?.unit,
      isLong: p.isLong,
      leverageX: leverageOf(p.sizeEth, p.collateral),
      entryPrice: p.entryPrice,
      exitPrice: m?.priceE8 ?? p.entryPrice,
      pnlEth: p.pnl,
      pnlPct: pnlPctOf(p.pnl, p.collateral),
      realized: false,
      handle: address,
    };
  }

  function redeem() {
    writeContract({
      address: ENGINE_ADDRESS,
      abi: perpEngineAbi,
      functionName: "withdraw",
      chainId: CHAIN_ID,
    });
  }

  const busy = isPending || confirming;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-white/50">Your positions</h2>

      {result && (
        <ResultBanner
          result={result}
          onShare={() => setCard(result.card)}
          onDismiss={() => setResult(null)}
        />
      )}

      {card && <PnlCardModal data={card} onClose={() => setCard(null)} />}

      {owed > 0n && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-sm">
          <span>
            Redeemable payout:{" "}
            <span className="font-medium text-emerald-300">
              {formatETH(owed, 6)} ETH
            </span>{" "}
            <span className="text-white/40">(escrowed from a close)</span>
          </span>
          <button
            disabled={busy}
            onClick={redeem}
            className="rounded-full bg-emerald-400 px-4 py-1.5 text-xs font-medium text-black hover:bg-emerald-300 disabled:opacity-40"
          >
            Redeem
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-white/40">Loading positions…</p>
      ) : positions.length === 0 ? (
        <p className="text-sm text-white/40">No open positions.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-white/40">
              <tr className="[&>th]:px-4 [&>th]:py-3">
                <th>Market</th>
                <th>Side</th>
                <th className="text-right">Size</th>
                <th className="text-right">Entry</th>
                <th className="text-right">uPnL</th>
                <th className="text-right">Borrow fee</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {positions.map((p) => {
                const pnlPos = p.pnl !== null && p.pnl >= 0n;
                return (
                  <tr key={p.id.toString()} className="[&>td]:px-4 [&>td]:py-3">
                    <td className="font-medium">
                      {symbolOf(p.commodityId)}
                      {p.liquidatable && (
                        <span className="ml-2 rounded-full bg-red-400/15 px-2 py-0.5 text-xs text-red-300">
                          liquidatable
                        </span>
                      )}
                    </td>
                    <td className={p.isLong ? "text-emerald-400" : "text-red-400"}>
                      {p.isLong ? "Long" : "Short"}
                    </td>
                    <td className="text-right text-white/70">
                      {formatETH(p.sizeEth)} ETH
                    </td>
                    <td className="text-right text-white/70">
                      {formatUsdPrice(p.entryPrice)}
                    </td>
                    <td
                      className={
                        "text-right " +
                        (p.pnl === null
                          ? "text-white/30"
                          : pnlPos
                            ? "text-emerald-400"
                            : "text-red-400")
                      }
                    >
                      {p.pnl === null
                        ? "stale"
                        : `${pnlPos ? "+" : ""}${formatETH(p.pnl, 6)}`}
                    </td>
                    <td className="text-right text-white/50">
                      {p.borrowFee === null ? "—" : formatETH(p.borrowFee, 6)}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          disabled={p.pnl === null}
                          onClick={() => {
                            const c = openCard(p);
                            if (c) setCard(c);
                          }}
                          title={p.pnl === null ? "Price stale" : "Share this position"}
                          className="rounded-full border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-30"
                        >
                          Card
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => close(p)}
                          className="rounded-full border border-white/15 px-4 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40"
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
        "mb-4 flex items-start justify-between rounded-2xl border px-5 py-4 " +
        (win
          ? "border-emerald-400/30 bg-emerald-400/10"
          : "border-red-400/30 bg-red-400/10")
      }
    >
      <div className="text-sm">
        <div className="font-medium">
          {result.liquidated ? "Liquidated" : "Closed"} {result.symbol} ·{" "}
          <span className={win ? "text-emerald-300" : "text-red-300"}>
            {win ? "▲ Win" : "▼ Loss"}
          </span>
        </div>
        <div className="mt-1 text-white/70">
          Realized PnL{" "}
          <span className={win ? "text-emerald-300" : "text-red-300"}>
            {win ? "+" : ""}
            {formatETH(result.pnl, 6)} ETH
          </span>{" "}
          · <span className="font-medium">{formatETH(result.payout, 6)} ETH</span>{" "}
          paid to your wallet
        </div>
      </div>
      <div className="ml-4 flex items-center gap-3">
        <button
          onClick={onShare}
          className={
            "rounded-full px-4 py-1.5 text-xs font-medium " +
            (win
              ? "bg-emerald-400 text-black hover:bg-emerald-300"
              : "bg-white/10 text-white hover:bg-white/20")
          }
        >
          {win ? "Share your win" : "Share card"}
        </button>
        <button
          onClick={onDismiss}
          className="text-white/40 hover:text-white"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
