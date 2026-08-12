"use client";

import { useReadContracts } from "wagmi";
import { type Address } from "viem";
import {
  marketLicenseNFTAbi,
  feeManagerAbi,
  LICENSE_NFT_ADDRESS,
  FEE_MANAGER_ADDRESS,
} from "@/lib/contracts";

export interface LicenseInfo {
  id: number;
  minted: boolean;
  holder: Address | null;
  accruedFees: bigint;
}

export function useLicenses(count: number) {
  const ids = Array.from({ length: count }, (_, i) => i);
  const contracts = ids.flatMap((i) => [
    {
      address: LICENSE_NFT_ADDRESS,
      abi: marketLicenseNFTAbi,
      functionName: "exists",
      args: [BigInt(i)],
    },
    {
      address: LICENSE_NFT_ADDRESS,
      abi: marketLicenseNFTAbi,
      functionName: "ownerOf",
      args: [BigInt(i)],
    },
    {
      address: FEE_MANAGER_ADDRESS,
      abi: feeManagerAbi,
      functionName: "commodityBucket",
      args: [BigInt(i)],
    },
  ]);

  const { data, refetch, isLoading } = useReadContracts({
    contracts,
    allowFailure: true,
    query: { enabled: count > 0, refetchInterval: 15_000 },
  });

  const licenses: LicenseInfo[] = ids.map((i) => {
    const minted = (data?.[i * 3]?.result as boolean | undefined) ?? false;
    const ownerRes = data?.[i * 3 + 1];
    const holder =
      minted && ownerRes?.status === "success"
        ? (ownerRes.result as Address)
        : null;
    const accruedFees = (data?.[i * 3 + 2]?.result as bigint | undefined) ?? 0n;
    return { id: i, minted, holder, accruedFees };
  });

  return { licenses, refetch, isLoading };
}
