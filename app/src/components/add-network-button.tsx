"use client";

import { useState } from "react";
import { robinhoodChain, EXPLORER_URL, CHAIN_ID } from "@/lib/chain";

/** Prompts the wallet to add the Robinhood chain so users can switch to it. */
export function AddNetworkButton() {
  const [state, setState] = useState<"idle" | "adding" | "done" | "error">(
    "idle"
  );

  async function add() {
    const eth = (globalThis as { ethereum?: EthereumProvider }).ethereum;
    if (!eth) return;
    setState("adding");
    try {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${CHAIN_ID.toString(16)}`,
            chainName: robinhoodChain.name,
            nativeCurrency: robinhoodChain.nativeCurrency,
            rpcUrls: robinhoodChain.rpcUrls.default.http,
            blockExplorerUrls: [EXPLORER_URL],
          },
        ],
      });
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      onClick={add}
      className="rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 transition-colors"
    >
      {state === "done" ? "Network added" : "Add network"}
    </button>
  );
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}
