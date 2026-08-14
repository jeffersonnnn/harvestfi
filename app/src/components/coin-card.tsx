"use client";

import Link from "next/link";
import { useAccount, useWriteContract } from "wagmi";
import { BENEFICIARY_VAULT, beneficiaryVaultAbi } from "@/lib/launchpad";
import { marketCapUsd } from "@/lib/coin-market";
import { CHAIN_ID } from "@/lib/chain";
import { prettyName, marketMeta } from "@/lib/commodities-meta";
import { truncateAddress } from "@/lib/format";
import type { LaunchItem } from "@/hooks/use-launches";
import type { MarketInfo } from "@/hooks/use-markets";

export function CoinCard({ item, market, ethUsd }: { item: LaunchItem; market?: MarketInfo; ethUsd: number }) {
  const { address } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const isCreator = !!address && item.creator.toLowerCase() === address.toLowerCase();
  const glyph = market ? marketMeta(market.symbol).glyph : "•";
  const mcap = item.priceEth ? marketCapUsd(item.priceEth, ethUsd) : undefined;

  return (
    <div className="rounded-xl border border-bone/10 bg-soil-900/40 p-4">
      <Link href={`/coins/${item.token}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium hover:text-wheat">{item.symbol ?? "..."}</div>
            <div className="truncate text-xs text-bone/50">{item.name ?? truncateAddress(item.token)}</div>
          </div>
          <span className="label shrink-0 rounded-full bg-soil-800 px-2 py-0.5 text-[0.68rem]">
            {glyph} {market ? prettyName(market.symbol) : `#${item.marketId}`}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-bone/45">Market cap</span>
          <span className="tnum text-bone/85">{mcap !== undefined ? fmtUsd(mcap) : "—"}</span>
        </div>
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bone/45">
        <Link className="text-wheat hover:underline" href={`/coins/${item.token}`}>
          chart →
        </Link>
        <a
          className="text-wheat hover:underline"
          href={`https://pools.trade/t/${item.token}`}
          target="_blank"
          rel="noreferrer"
        >
          trade ↗
        </a>
        <span>by {truncateAddress(item.creator)}</span>
      </div>

      {isCreator && (
        <button
          disabled={isPending}
          onClick={() =>
            writeContract({
              address: BENEFICIARY_VAULT,
              abi: beneficiaryVaultAbi,
              functionName: "claim",
              args: [item.positionId, 0n, 0n],
              chainId: CHAIN_ID,
            })
          }
          className="mt-3 rounded-full border border-field/40 bg-field/10 px-3 py-1.5 text-xs text-field transition-colors hover:bg-field/20 disabled:opacity-40"
        >
          {isPending ? "Collecting..." : "Collect fees"}
        </button>
      )}
    </div>
  );
}

function fmtUsd(v: number): string {
  if (!isFinite(v) || v === 0) return "$0";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  if (v >= 1) return "$" + v.toFixed(2);
  return "$" + v.toPrecision(3);
}
