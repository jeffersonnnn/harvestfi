"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useLp } from "@/hooks/use-lp";
import { liquidityPoolAbi, POOL_ADDRESS } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { formatETH } from "@/lib/format";

export function LpPanel() {
  const { isConnected } = useAccount();
  const { totalAssets, totalShares, myShares, myValue, sharePriceE18 } = useLp();
  const [deposit, setDeposit] = useState("0.01");
  const [withdraw, setWithdraw] = useState("");

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const queryClient = useQueryClient();
  useEffect(() => {
    if (isSuccess) queryClient.invalidateQueries();
  }, [isSuccess, queryClient]);
  const busy = isPending || confirming;

  function doDeposit() {
    const n = Number(deposit);
    if (!(n > 0)) return;
    writeContract({
      address: POOL_ADDRESS,
      abi: liquidityPoolAbi,
      functionName: "deposit",
      value: parseEther(deposit),
      chainId: CHAIN_ID,
    });
  }

  function doWithdraw() {
    const n = Number(withdraw);
    if (!(n > 0) || totalAssets === 0n) return;
    // Convert an ETH amount to shares: shares = eth * totalShares / totalAssets.
    let shares = (parseEther(withdraw) * totalShares) / totalAssets;
    if (shares > myShares) shares = myShares;
    if (shares === 0n) return;
    writeContract({
      address: POOL_ADDRESS,
      abi: liquidityPoolAbi,
      functionName: "withdraw",
      args: [shares],
      chainId: CHAIN_ID,
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pool liquidity" value={`${formatETH(totalAssets)} ETH`} />
        <Stat label="Share price" value={`${formatETH(sharePriceE18)} ETH`} />
        <Stat label="Your position" value={`${formatETH(myValue)} ETH`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-bone/10 bg-bone/[0.02] p-5">
          <h3 className="mb-3 text-sm font-medium">Deposit</h3>
          <input
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            inputMode="decimal"
            className="mb-3 w-full rounded-xl border border-bone/10 bg-bone/5 px-3 py-2 text-sm outline-none focus:border-bone/30"
          />
          <button
            disabled={!isConnected || busy}
            onClick={doDeposit}
            className="w-full rounded-xl bg-field px-4 py-2.5 text-sm font-medium text-soil-950 hover:bg-field/90 disabled:opacity-40"
          >
            {isConnected ? "Deposit ETH" : "Connect wallet"}
          </button>
        </div>

        <div className="rounded-2xl border border-bone/10 bg-bone/[0.02] p-5">
          <h3 className="mb-3 text-sm font-medium">Withdraw</h3>
          <input
            value={withdraw}
            onChange={(e) => setWithdraw(e.target.value)}
            inputMode="decimal"
            placeholder={`max ${formatETH(myValue)} ETH`}
            className="mb-3 w-full rounded-xl border border-bone/10 bg-bone/5 px-3 py-2 text-sm outline-none placeholder:text-bone/25 focus:border-bone/30"
          />
          <button
            disabled={!isConnected || busy || myShares === 0n}
            onClick={doWithdraw}
            className="w-full rounded-xl border border-bone/15 px-4 py-2.5 text-sm hover:bg-bone/10 disabled:opacity-40"
          >
            Withdraw
          </button>
        </div>
      </div>
      {error && (
        <p className="break-words text-xs text-rust">{error.message.slice(0, 160)}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-bone/10 bg-bone/[0.02] p-4">
      <div className="text-xs text-bone/40">{label}</div>
      <div className="mt-1 text-lg font-medium">{value}</div>
    </div>
  );
}
