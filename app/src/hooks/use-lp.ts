"use client";

import { useAccount, useReadContracts } from "wagmi";
import { liquidityPoolAbi, POOL_ADDRESS } from "@/lib/contracts";

const ZERO = "0x0000000000000000000000000000000000000000";

export function useLp() {
  const { address } = useAccount();
  const { data, refetch } = useReadContracts({
    contracts: [
      { address: POOL_ADDRESS, abi: liquidityPoolAbi, functionName: "totalAssets" },
      { address: POOL_ADDRESS, abi: liquidityPoolAbi, functionName: "totalShares" },
      { address: POOL_ADDRESS, abi: liquidityPoolAbi, functionName: "sharePriceE18" },
      {
        address: POOL_ADDRESS,
        abi: liquidityPoolAbi,
        functionName: "shares",
        args: [address ?? ZERO],
      },
    ],
    query: { refetchInterval: 12_000 },
  });

  const totalAssets = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const totalShares = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const sharePriceE18 = (data?.[2]?.result as bigint | undefined) ?? 0n;
  const myShares = (data?.[3]?.result as bigint | undefined) ?? 0n;
  const myValue =
    totalShares > 0n ? (myShares * totalAssets) / totalShares : 0n;

  return { totalAssets, totalShares, sharePriceE18, myShares, myValue, refetch };
}
