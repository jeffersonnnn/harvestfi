"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { CHAIN_ID, robinhoodChain } from "@/lib/chain";

/** Shows a switch prompt when the wallet is connected to the wrong chain. */
export function NetworkBanner() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === CHAIN_ID) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-wheat/15 px-4 py-2 text-sm text-amber-200">
      <span>
        Wrong network (chain {chainId}). This app runs on {robinhoodChain.name}{" "}
        ({CHAIN_ID}).
      </span>
      <button
        disabled={isPending}
        onClick={() => switchChain({ chainId: CHAIN_ID })}
        className="rounded-full bg-wheat px-3 py-1 text-xs font-medium text-soil-950 hover:bg-wheat/90 disabled:opacity-50"
      >
        {isPending ? "Switching…" : "Switch network"}
      </button>
    </div>
  );
}
