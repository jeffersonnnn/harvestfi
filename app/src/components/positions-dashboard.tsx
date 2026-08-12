"use client";

import { useEffect, useState } from "react";
import { parseEventLogs } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { usePositions } from "@/hooks/use-positions";
import { type MarketInfo } from "@/hooks/use-markets";
import { perpEngineAbi, ENGINE_ADDRESS } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { formatUsdPrice, formatETH } from "@/lib/format";

const ZERO = "0x0000000000000000000000000000000000000000";

interface CloseResult {
  symbol: string;
  pnl: bigint; // signed realized PnL
  payout: bigint; // ETH returned to the trader
  liquidated: boolean;
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

  // Escrowed payout (only set if a direct push to the trader ever failed).
  const { data: owedData } = useReadContract({
    address: ENGINE_ADDRESS,
    abi: perpEngineAbi,
    functionName: "owed",
    args: [address ?? ZERO],
    query: { enabled: isConnected, refetchInterval: 12_000 },
  });
  const owed = (owedData as bigint | undefined) ?? 0n;

  const symbolOf = (cid: number) =>
    markets.find((m) => m.id === cid)?.symbol ?? `#${cid}`;

  // On a confirmed close, decode the on-chain PositionClosed event to show the realized outcome.
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
          pnl: bigint;
          payout: bigint;
          liquidated: boolean;
        };
        setResult({
          symbol: symbolOf(Number(a.commodityId)),
          pnl: a.pnl,
          payout: a.payout,
          liquidated: a.liquidated,
        });
      }
    } catch {
      /* non-close tx (e.g. redeem) — no banner */
    }
    queryClient.invalidateQueries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, receipt]);

  if (!isConnected) return null;

  function close(id: bigint) {
    writeContract({
      address: ENGINE_ADDRESS,
      abi: perpEngineAbi,
      functionName: "closePosition",
      args: [id, 0n],
      chainId: CHAIN_ID,
    });
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

      {result && <ResultBanner result={result} onDismiss={() => setResult(null)} />}

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
                      <button
                        disabled={busy}
                        onClick={() => close(p.id)}
                        className="rounded-full border border-white/15 px-4 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40"
                      >
                        Close
                      </button>
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
  onDismiss,
}: {
  result: CloseResult;
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
      <button
        onClick={onDismiss}
        className="ml-4 text-white/40 hover:text-white"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
