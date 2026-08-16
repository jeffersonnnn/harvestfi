"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { parseEther } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useLicenses } from "@/hooks/use-licenses";
import { type MarketInfo } from "@/hooks/use-markets";
import {
  marketLicenseNFTAbi,
  feeManagerAbi,
  licenseMarketplaceAbi,
  LICENSE_NFT_ADDRESS,
  FEE_MANAGER_ADDRESS,
  MARKETPLACE_ADDRESS,
  MINT_PRICE_WEI,
} from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { formatETH, truncateAddress } from "@/lib/format";
import { marketMeta, prettyName } from "@/lib/commodities-meta";

export function LicensesTable({
  markets,
  lastSale,
}: {
  markets: MarketInfo[];
  lastSale?: Map<number, bigint>;
}) {
  const { address, isConnected } = useAccount();
  const { licenses } = useLicenses(markets.length);
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Live on-chain mint price (owner-settable, no redeploy).
  const { data: mintPrice } = useReadContract({
    address: LICENSE_NFT_ADDRESS,
    abi: marketLicenseNFTAbi,
    functionName: "mintPrice",
    chainId: CHAIN_ID,
  });
  const price = (mintPrice as bigint | undefined) ?? MINT_PRICE_WEI;

  // Marketplace: has the user approved the marketplace to move their licenses?
  const { data: approvedForAll } = useReadContract({
    address: LICENSE_NFT_ADDRESS,
    abi: marketLicenseNFTAbi,
    functionName: "isApprovedForAll",
    args: address ? [address, MARKETPLACE_ADDRESS] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  });
  const approved = approvedForAll === true;

  // Pull-payment balances for the connected user.
  const { data: proceeds } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: licenseMarketplaceAbi,
    functionName: "proceeds",
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const { data: settled } = useReadContract({
    address: FEE_MANAGER_ADDRESS,
    abi: feeManagerAbi,
    functionName: "withdrawable",
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const saleProceeds = (proceeds as bigint | undefined) ?? 0n;
  const settledFees = (settled as bigint | undefined) ?? 0n;

  const queryClient = useQueryClient();
  useEffect(() => {
    if (isSuccess) queryClient.invalidateQueries();
  }, [isSuccess, queryClient]);
  const busy = isPending || confirming;

  // Inline "list / reprice" editor state.
  const [editRow, setEditRow] = useState<number | null>(null);
  const [priceStr, setPriceStr] = useState("");
  const [formErr, setFormErr] = useState("");

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
    writeContract({ address: FEE_MANAGER_ADDRESS, abi: feeManagerAbi, functionName: "claim", args: [BigInt(id)], chainId: CHAIN_ID });
  }
  function approveMarketplace() {
    writeContract({
      address: LICENSE_NFT_ADDRESS,
      abi: marketLicenseNFTAbi,
      functionName: "setApprovalForAll",
      args: [MARKETPLACE_ADDRESS, true],
      chainId: CHAIN_ID,
    });
  }
  function submitListing(id: number, isUpdate: boolean) {
    setFormErr("");
    let wei: bigint;
    try {
      wei = parseEther(priceStr.trim());
    } catch {
      setFormErr("Enter a valid ETH price");
      return;
    }
    if (wei <= 0n) {
      setFormErr("Price must be above 0");
      return;
    }
    writeContract({
      address: MARKETPLACE_ADDRESS,
      abi: licenseMarketplaceAbi,
      functionName: isUpdate ? "updatePrice" : "list",
      args: [BigInt(id), wei],
      chainId: CHAIN_ID,
    });
    setEditRow(null);
    setPriceStr("");
  }
  function cancelListing(id: number) {
    writeContract({ address: MARKETPLACE_ADDRESS, abi: licenseMarketplaceAbi, functionName: "cancel", args: [BigInt(id)], chainId: CHAIN_ID });
  }
  function buy(id: number, priceWei: bigint) {
    writeContract({ address: MARKETPLACE_ADDRESS, abi: licenseMarketplaceAbi, functionName: "buy", args: [BigInt(id)], value: priceWei, chainId: CHAIN_ID });
  }
  function withdrawProceeds() {
    writeContract({ address: MARKETPLACE_ADDRESS, abi: licenseMarketplaceAbi, functionName: "withdrawProceeds", args: [], chainId: CHAIN_ID });
  }
  function claimSettled() {
    writeContract({ address: FEE_MANAGER_ADDRESS, abi: feeManagerAbi, functionName: "claimSettled", args: [], chainId: CHAIN_ID });
  }

  function openEditor(id: number, current: bigint) {
    setFormErr("");
    setEditRow(id);
    setPriceStr(current > 0n ? formatETH(current, 4) : "");
  }

  return (
    <div className="space-y-4">
      {/* Account-level pull-payment prompts */}
      {(saleProceeds > 0n || settledFees > 0n) && (
        <div className="flex flex-wrap gap-3">
          {saleProceeds > 0n && (
            <div className="flex items-center gap-3 rounded-xl border border-wheat/25 bg-wheat/[0.06] px-4 py-2.5 text-sm">
              <span className="text-bone/80">
                <span className="tnum text-wheat">{formatETH(saleProceeds, 5)} ETH</span> from a license sale
              </span>
              <button
                disabled={busy}
                onClick={withdrawProceeds}
                className="rounded-full bg-wheat px-3 py-1 text-xs font-semibold text-soil-950 hover:bg-wheat/90 disabled:opacity-40"
              >
                Withdraw
              </button>
            </div>
          )}
          {settledFees > 0n && (
            <div className="flex items-center gap-3 rounded-xl border border-field/25 bg-field/[0.06] px-4 py-2.5 text-sm">
              <span className="text-bone/80">
                <span className="tnum text-field">{formatETH(settledFees, 5)} ETH</span> in settled fees
              </span>
              <button
                disabled={busy}
                onClick={claimSettled}
                className="rounded-full border border-field/40 bg-field/10 px-3 py-1 text-xs text-field hover:bg-field/20 disabled:opacity-40"
              >
                Claim
              </button>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-bone/10 bg-soil-900/40">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="label border-b border-bone/10 text-left text-bone/40 [&>th]:px-4 [&>th]:py-3 [&>th]:font-normal">
              <th>Commodity</th>
              <th>Holder</th>
              <th className="text-right">Accrued fees · 70%</th>
              <th className="text-right">Market</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => {
              const lic = licenses.find((l) => l.id === m.id);
              const meta = marketMeta(m.symbol);
              const accrued = lic?.accruedFees ?? 0n;
              const isHolder = !!lic?.holder && !!address && lic.holder.toLowerCase() === address.toLowerCase();
              const hasBacklog = !lic?.minted && accrued > 0n;
              // A listing is only actionable if its seller still holds the token.
              const activeListing =
                !!lic?.listed &&
                !!lic.holder &&
                !!lic.listingSeller &&
                lic.holder.toLowerCase() === lic.listingSeller.toLowerCase();
              const editing = editRow === m.id;
              const last = lastSale?.get(m.id);

              return (
                <tr
                  key={m.id}
                  className="border-b border-bone/5 transition-colors last:border-0 hover:bg-bone/[0.02] [&>td]:px-4 [&>td]:py-3.5"
                >
                  {/* Commodity */}
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-md bg-soil-800 text-lg">{meta.glyph}</span>
                      <div>
                        <div className="font-medium leading-tight">{prettyName(m.symbol)}</div>
                        <div className="tnum text-xs text-bone/40">{m.symbol} · License #{m.id}</div>
                      </div>
                    </div>
                  </td>

                  {/* Holder */}
                  <td className="text-bone/60">
                    {!lic?.minted ? (
                      <span className="label rounded-full border border-bone/15 px-2 py-0.5 text-bone/40">unminted</span>
                    ) : isHolder ? (
                      <span className="label rounded-full bg-field/15 px-2 py-0.5 text-field">you</span>
                    ) : (
                      <span className="tnum text-xs">{truncateAddress(lic!.holder!)}</span>
                    )}
                    {activeListing && (
                      <span className="label ml-2 rounded-full bg-wheat/15 px-2 py-0.5 text-wheat">
                        listed · {formatETH(lic!.listingPrice, 4)} ETH
                      </span>
                    )}
                    {last !== undefined && last > 0n && (
                      <span className="label ml-2 text-bone/40">last {formatETH(last, 4)} ETH</span>
                    )}
                  </td>

                  {/* Accrued fees */}
                  <td className="text-right">
                    <span className="tnum text-bone/80">{formatETH(accrued, 6)} ETH</span>
                    {hasBacklog && <div className="label mt-0.5 text-wheat/80">claimable on mint</div>}
                  </td>

                  {/* Market actions */}
                  <td className="text-right">
                    {editing ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="flex items-center overflow-hidden rounded-full border border-bone/15 bg-soil-950">
                          <input
                            autoFocus
                            value={priceStr}
                            onChange={(e) => setPriceStr(e.target.value)}
                            placeholder="0.00"
                            inputMode="decimal"
                            className="tnum w-24 bg-transparent px-3 py-1.5 text-right text-xs outline-none"
                          />
                          <span className="px-2 text-xs text-bone/40">ETH</span>
                        </div>
                        <button
                          disabled={busy}
                          onClick={() => submitListing(m.id, activeListing)}
                          className="rounded-full bg-wheat px-3 py-1.5 text-xs font-semibold text-soil-950 hover:bg-wheat/90 disabled:opacity-40"
                        >
                          {activeListing ? "Update" : "List"}
                        </button>
                        <button onClick={() => setEditRow(null)} className="text-xs text-bone/40 hover:text-bone/70">
                          ✕
                        </button>
                      </div>
                    ) : !lic?.minted ? (
                      <button
                        disabled={!isConnected || busy}
                        onClick={() => mint(m.id)}
                        className="rounded-full bg-wheat px-4 py-1.5 text-xs font-semibold text-soil-950 transition-colors hover:bg-wheat/90 disabled:opacity-40"
                      >
                        Mint · {formatETH(price, 3)} ETH
                      </button>
                    ) : isHolder ? (
                      <div className="flex items-center justify-end gap-2">
                        {accrued > 0n && (
                          <button
                            disabled={busy}
                            onClick={() => claim(m.id)}
                            className="rounded-full border border-bone/15 px-3 py-1.5 text-xs transition-colors hover:bg-bone/10 disabled:opacity-40"
                          >
                            Claim fees
                          </button>
                        )}
                        {activeListing ? (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => openEditor(m.id, lic!.listingPrice)}
                              className="rounded-full border border-bone/15 px-3 py-1.5 text-xs hover:bg-bone/10 disabled:opacity-40"
                            >
                              Reprice
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => cancelListing(m.id)}
                              className="rounded-full border border-rust/30 px-3 py-1.5 text-xs text-rust/90 hover:bg-rust/10 disabled:opacity-40"
                            >
                              Cancel
                            </button>
                          </>
                        ) : approved ? (
                          <button
                            disabled={busy}
                            onClick={() => openEditor(m.id, 0n)}
                            className="rounded-full bg-wheat px-4 py-1.5 text-xs font-semibold text-soil-950 hover:bg-wheat/90 disabled:opacity-40"
                          >
                            List for sale
                          </button>
                        ) : (
                          <button
                            disabled={busy}
                            onClick={approveMarketplace}
                            className="rounded-full bg-wheat px-4 py-1.5 text-xs font-semibold text-soil-950 hover:bg-wheat/90 disabled:opacity-40"
                          >
                            Approve to list
                          </button>
                        )}
                      </div>
                    ) : activeListing ? (
                      <button
                        disabled={!isConnected || busy}
                        onClick={() => buy(m.id, lic!.listingPrice)}
                        className="rounded-full bg-wheat px-4 py-1.5 text-xs font-semibold text-soil-950 transition-colors hover:bg-wheat/90 disabled:opacity-40"
                      >
                        Buy · {formatETH(lic!.listingPrice, 4)} ETH
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
      {formErr && <p className="text-sm text-rust">{formErr}</p>}
      <p className="text-xs text-bone/40">
        Listings are non-custodial: your license stays in your wallet and keeps earning fees until it sells. A sale
        settles your earned fees to you and charges a small protocol fee (2.5%). Prices are in ETH.
      </p>
    </div>
  );
}
