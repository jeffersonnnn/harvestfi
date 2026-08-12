"use client";

import { useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useLicenses } from "@/hooks/use-licenses";
import { type MarketInfo } from "@/hooks/use-markets";
import {
  marketLicenseNFTAbi,
  feeManagerAbi,
  LICENSE_NFT_ADDRESS,
  FEE_MANAGER_ADDRESS,
  MINT_PRICE_WEI,
} from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { formatETH, truncateAddress } from "@/lib/format";

export function LicensesTable({ markets }: { markets: MarketInfo[] }) {
  const { address, isConnected } = useAccount();
  const { licenses } = useLicenses(markets.length);
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const queryClient = useQueryClient();
  useEffect(() => {
    if (isSuccess) queryClient.invalidateQueries();
  }, [isSuccess, queryClient]);
  const busy = isPending || confirming;

  function mint(id: number) {
    writeContract({
      address: LICENSE_NFT_ADDRESS,
      abi: marketLicenseNFTAbi,
      functionName: "mint",
      args: [BigInt(id)],
      value: MINT_PRICE_WEI,
      chainId: CHAIN_ID,
    });
  }

  function claim(id: number) {
    writeContract({
      address: FEE_MANAGER_ADDRESS,
      abi: feeManagerAbi,
      functionName: "claim",
      args: [BigInt(id)],
      chainId: CHAIN_ID,
    });
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-bone/10">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-bone/40">
          <tr className="[&>th]:px-4 [&>th]:py-3">
            <th>Commodity</th>
            <th>Holder</th>
            <th className="text-right">Accrued fees</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bone/5">
          {markets.map((m) => {
            const lic = licenses.find((l) => l.id === m.id);
            const isHolder =
              lic?.holder && address && lic.holder.toLowerCase() === address.toLowerCase();
            return (
              <tr key={m.id} className="[&>td]:px-4 [&>td]:py-3">
                <td className="font-medium">{m.symbol}</td>
                <td className="text-bone/60">
                  {!lic?.minted ? (
                    <span className="text-bone/30">unminted</span>
                  ) : isHolder ? (
                    <span className="text-field">you</span>
                  ) : (
                    <span className="font-mono">{truncateAddress(lic.holder!)}</span>
                  )}
                </td>
                <td className="text-right text-bone/70">
                  {formatETH(lic?.accruedFees ?? 0n, 6)} ETH
                </td>
                <td className="text-right">
                  {!lic?.minted ? (
                    <button
                      disabled={!isConnected || busy}
                      onClick={() => mint(m.id)}
                      className="rounded-full bg-field px-4 py-1.5 text-xs font-medium text-soil-950 hover:bg-field/90 disabled:opacity-40"
                    >
                      Mint · {formatETH(MINT_PRICE_WEI, 3)} ETH
                    </button>
                  ) : isHolder ? (
                    <button
                      disabled={busy || (lic?.accruedFees ?? 0n) === 0n}
                      onClick={() => claim(m.id)}
                      className="rounded-full border border-bone/15 px-4 py-1.5 text-xs hover:bg-bone/10 disabled:opacity-40"
                    >
                      Claim fees
                    </button>
                  ) : (
                    <span className="text-xs text-bone/30">held</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
