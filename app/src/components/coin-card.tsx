"use client";

import Link from "next/link";
import { useAccount, useWriteContract } from "wagmi";
import { BENEFICIARY_VAULT, beneficiaryVaultAbi } from "@/lib/launchpad";
import { marketCapUsd } from "@/lib/coin-market";
import { CHAIN_ID } from "@/lib/chain";
import { prettyName } from "@/lib/commodities-meta";
import { truncateAddress } from "@/lib/format";
import { CoinAvatar } from "./coin-avatar";
import type { LaunchItem } from "@/hooks/use-launches";
import type { MarketInfo } from "@/hooks/use-markets";

export function CoinCard({ item, market, ethUsd }: { item: LaunchItem; market?: MarketInfo; ethUsd: number }) {
  const { address } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const isCreator = !!address && item.creator.toLowerCase() === address.toLowerCase();
  const mcap = item.priceEth ? marketCapUsd(item.priceEth, ethUsd) : undefined;

  return (
    <div className="rounded-xl border border-bone/10 bg-soil-900/40 p-4">
      <Link href={`/coins/${item.token}`} className="block">
        <div className="flex items-center gap-3">
          <CoinAvatar image={item.image} marketSymbol={market?.symbol} size={46} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">
              <span className="hover:text-wheat">{item.symbol ?? "..."}</span>
              {market && (
                <>
                  <span className="text-bone/30"> / </span>
                  <span className="text-wheat">{prettyName(market.symbol)}</span>
                </>
              )}
            </div>
            <div className="truncate text-xs text-bone/50">{item.name ?? truncateAddress(item.token)}</div>
          </div>
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
