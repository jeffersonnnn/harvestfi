"use client";

import { useReadContracts } from "wagmi";
import { type Address, zeroAddress } from "viem";
import {
  marketLicenseNFTAbi,
  feeManagerAbi,
  licenseMarketplaceAbi,
  LICENSE_NFT_ADDRESS,
  FEE_MANAGER_ADDRESS,
  MARKETPLACE_ADDRESS,
} from "@/lib/contracts";

export interface LicenseInfo {
  id: number;
  minted: boolean;
  holder: Address | null;
  accruedFees: bigint;
  // secondary-market listing (from LicenseMarketplace)
  listed: boolean;
  listingSeller: Address | null;
  listingPrice: bigint;
}

const PER_ID = 4; // reads per market: exists, ownerOf, commodityBucket, getListing

export function useLicenses(count: number) {
  const ids = Array.from({ length: count }, (_, i) => i);
  const contracts = ids.flatMap((i) => [
    { address: LICENSE_NFT_ADDRESS, abi: marketLicenseNFTAbi, functionName: "exists", args: [BigInt(i)] },
    { address: LICENSE_NFT_ADDRESS, abi: marketLicenseNFTAbi, functionName: "ownerOf", args: [BigInt(i)] },
    { address: FEE_MANAGER_ADDRESS, abi: feeManagerAbi, functionName: "commodityBucket", args: [BigInt(i)] },
    { address: MARKETPLACE_ADDRESS, abi: licenseMarketplaceAbi, functionName: "getListing", args: [BigInt(i)] },
  ]);

  const { data, refetch, isLoading } = useReadContracts({
    contracts,
    allowFailure: true,
    query: { enabled: count > 0, refetchInterval: 15_000 },
  });

  const licenses: LicenseInfo[] = ids.map((i) => {
    const base = i * PER_ID;
    const minted = (data?.[base]?.result as boolean | undefined) ?? false;
    const ownerRes = data?.[base + 1];
    const holder = minted && ownerRes?.status === "success" ? (ownerRes.result as Address) : null;
    const accruedFees = (data?.[base + 2]?.result as bigint | undefined) ?? 0n;

    const listing = data?.[base + 3]?.result as readonly [Address, bigint] | undefined;
    const listingSeller = listing?.[0] ?? null;
    const listingPrice = listing?.[1] ?? 0n;
    const listed = !!listingSeller && listingSeller !== zeroAddress;

    return {
      id: i,
      minted,
      holder,
      accruedFees,
      listed,
      listingSeller: listed ? listingSeller : null,
      listingPrice: listed ? listingPrice : 0n,
    };
  });

  return { licenses, refetch, isLoading };
}
