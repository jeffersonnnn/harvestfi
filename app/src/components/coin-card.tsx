"use client";

import { useAccount, useWriteContract } from "wagmi";
import { BENEFICIARY_VAULT, beneficiaryVaultAbi } from "@/lib/launchpad";
import { CHAIN_ID, EXPLORER_URL } from "@/lib/chain";
import { prettyName, marketMeta } from "@/lib/commodities-meta";
import { truncateAddress } from "@/lib/format";
import type { LaunchItem } from "@/hooks/use-launches";
import type { MarketInfo } from "@/hooks/use-markets";

export function CoinCard({ item, market }: { item: LaunchItem; market?: MarketInfo }) {
  const { address } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const isCreator = !!address && item.creator.toLowerCase() === address.toLowerCase();
  const glyph = market ? marketMeta(market.symbol).glyph : "•";

  return (
    <div className="rounded-xl border border-bone/10 bg-soil-900/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{item.symbol ?? "..."}</div>
          <div className="truncate text-xs text-bone/50">{item.name ?? truncateAddress(item.token)}</div>
        </div>
        <span className="label shrink-0 rounded-full bg-soil-800 px-2 py-0.5 text-[0.68rem]">
          {glyph} {market ? prettyName(market.symbol) : `#${item.marketId}`}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bone/45">
        <a
          className="text-wheat hover:underline"
          href={`https://pools.trade/t/${item.token}`}
          target="_blank"
          rel="noreferrer"
        >
          pools.trade
        </a>
        <a
          className="text-wheat hover:underline"
          href={`${EXPLORER_URL}/address/${item.token}`}
          target="_blank"
          rel="noreferrer"
        >
          explorer
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
