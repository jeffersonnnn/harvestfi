"use client";

import { useEffect } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
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
import { marketMeta, prettyName } from "@/lib/commodities-meta";

export function LicensesTable({ markets }: { markets: MarketInfo[] }) {
  const { address, isConnected } = useAccount();
  const { licenses } = useLicenses(markets.length);
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  // Read the live on-chain mint price so the button + value always match the contract
  // (the owner can change it via setMintPrice with no frontend redeploy).
  const { data: mintPrice } = useReadContract({
    address: LICENSE_NFT_ADDRESS,
    abi: marketLicenseNFTAbi,
    functionName: "mintPrice",
    chainId: CHAIN_ID,
  });
  const price = (mintPrice as bigint | undefined) ?? MINT_PRICE_WEI;
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
      value: price,
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
    <div className="overflow-x-auto rounded-2xl border border-bone/10 bg-soil-900/40">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="label border-b border-bone/10 text-left text-bone/40 [&>th]:px-4 [&>th]:py-3 [&>th]:font-normal">
            <th>Commodity</th>
            <th>Holder</th>
            <th className="text-right">Accrued fees · your 70%</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => {
            const lic = licenses.find((l) => l.id === m.id);
            const meta = marketMeta(m.symbol);
            const accrued = lic?.accruedFees ?? 0n;
            const isHolder =
              lic?.holder && address && lic.holder.toLowerCase() === address.toLowerCase();
            const hasBacklog = !lic?.minted && accrued > 0n;

            return (
              <tr
                key={m.id}
                className="border-b border-bone/5 transition-colors last:border-0 hover:bg-bone/[0.02] [&>td]:px-4 [&>td]:py-3.5"
              >
                {/* Commodity - glyph as the license's visual identity */}
                <td>
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-md bg-soil-800 text-lg">
                      {meta.glyph}
                    </span>
                    <div>
                      <div className="font-medium leading-tight">{prettyName(m.symbol)}</div>
                      <div className="tnum text-xs text-bone/40">
                        {m.symbol} · License #{m.id}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Holder */}
                <td className="text-bone/60">
                  {!lic?.minted ? (
                    <span className="label rounded-full border border-bone/15 px-2 py-0.5 text-bone/40">
                      unminted
                    </span>
                  ) : isHolder ? (
                    <span className="label rounded-full bg-field/15 px-2 py-0.5 text-field">you</span>
                  ) : (
                    <span className="tnum text-xs">{truncateAddress(lic.holder!)}</span>
                  )}
                </td>

                {/* Accrued fees (the holder's claimable 70% share) */}
                <td className="text-right">
                  <span className="tnum text-bone/80">{formatETH(accrued, 6)} ETH</span>
                  {hasBacklog && (
                    <div className="label mt-0.5 text-wheat/80">claimable on mint</div>
                  )}
                </td>

                {/* Action */}
                <td className="text-right">
                  {!lic?.minted ? (
                    <button
                      disabled={!isConnected || busy}
                      onClick={() => mint(m.id)}
                      className="rounded-full bg-wheat px-4 py-1.5 text-xs font-semibold text-soil-950 transition-colors hover:bg-wheat/90 disabled:opacity-40"
                    >
                      Mint · {formatETH(price, 3)} ETH
                    </button>
                  ) : isHolder ? (
                    <button
                      disabled={busy || accrued === 0n}
                      onClick={() => claim(m.id)}
                      className="rounded-full border border-bone/15 px-4 py-1.5 text-xs transition-colors hover:bg-bone/10 disabled:opacity-40"
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
