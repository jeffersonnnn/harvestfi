"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { predictionMarketAbi, PREDICTION_MARKET_ADDRESS } from "@/lib/contracts";
import { CHAIN_ID } from "@/lib/chain";
import { type MarketInfo } from "@/hooks/use-markets";
import { marketMeta } from "@/lib/commodities-meta";

export type Phase = "open" | "awaiting" | "resolved" | "cancelled";

export interface PredictionInfo {
  id: number;
  commodityId: number;
  symbol: string;
  glyph: string;
  thresholdE8: bigint;
  expiry: number;
  isAbove: boolean;
  status: number; // 0 Open, 1 Resolved, 2 Cancelled
  outcomeYes: boolean;
  yesPool: bigint;
  noPool: bigint;
  winnerPool: bigint;
  netLosingPool: bigint;
  resolvedPrice: bigint;
  yesBps: number;
  noBps: number;
  currentPriceE8: bigint; // live oracle price of the underlying commodity
  phase: Phase;
  // connected user's position
  myYes: bigint;
  myNo: bigint;
  myClaimable: bigint;
  claimed: boolean;
}

interface MarketStruct {
  commodityId: bigint;
  thresholdE8: bigint;
  expiry: bigint;
  isAbove: boolean;
  status: number;
  outcomeYes: boolean;
  yesPool: bigint;
  noPool: bigint;
  winnerPool: bigint;
  netLosingPool: bigint;
  resolvedPrice: bigint;
  creator: `0x${string}`;
}

/**
 * Reads every prediction market from the contract, joins each to its commodity (symbol, glyph, live
 * price) via the markets already loaded, and — when a wallet is connected — the user's stake and
 * claimable amount per market. Multicall-based, refetched every 12s.
 */
export function usePredictions(markets: MarketInfo[]) {
  const { address } = useAccount();

  const bySymbol = new Map(markets.map((m) => [m.id, m]));

  const { data: countData, refetch: refetchCount } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: "marketCount",
    chainId: CHAIN_ID,
    query: { refetchInterval: 20_000 },
  });
  const { data: feeBpsData } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: "feeBps",
    chainId: CHAIN_ID,
  });
  const feeBps = feeBpsData ? Number(feeBpsData) : 250;
  const count = countData ? Number(countData) : 0;
  const ids = Array.from({ length: count }, (_, i) => i);

  // 2 reads per market: the struct + live odds.
  const baseContracts = ids.flatMap((i) => [
    {
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "getMarket",
      args: [BigInt(i)],
      chainId: CHAIN_ID,
    },
    {
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "odds",
      args: [BigInt(i)],
      chainId: CHAIN_ID,
    },
  ]);

  const { data: baseData, isLoading, refetch: refetchBase } = useReadContracts({
    contracts: baseContracts,
    query: { enabled: count > 0, refetchInterval: 12_000 },
  });

  // 3 reads per market for the connected user: yes stake, no stake, claimable.
  const userContracts = address
    ? ids.flatMap((i) => [
        {
          address: PREDICTION_MARKET_ADDRESS,
          abi: predictionMarketAbi,
          functionName: "yesStake",
          args: [BigInt(i), address],
          chainId: CHAIN_ID,
        },
        {
          address: PREDICTION_MARKET_ADDRESS,
          abi: predictionMarketAbi,
          functionName: "noStake",
          args: [BigInt(i), address],
          chainId: CHAIN_ID,
        },
        {
          address: PREDICTION_MARKET_ADDRESS,
          abi: predictionMarketAbi,
          functionName: "claimable",
          args: [BigInt(i), address],
          chainId: CHAIN_ID,
        },
      ])
    : [];

  const { data: userData, refetch: refetchUser } = useReadContracts({
    contracts: userContracts,
    query: { enabled: !!address && count > 0, refetchInterval: 12_000 },
  });

  const now = Math.floor(Date.now() / 1000);
  const predictions: PredictionInfo[] = ids.map((i) => {
    const m = baseData?.[i * 2]?.result as unknown as MarketStruct | undefined;
    const o = baseData?.[i * 2 + 1]?.result as unknown as readonly [bigint, bigint] | undefined;
    const commodityId = m ? Number(m.commodityId) : 0;
    const meta = bySymbol.get(commodityId);
    const status = m ? Number(m.status) : 0;
    const expiry = m ? Number(m.expiry) : 0;
    const phase: Phase =
      status === 1 ? "resolved" : status === 2 ? "cancelled" : expiry > now ? "open" : "awaiting";

    const myYes = (userData?.[i * 3]?.result as bigint | undefined) ?? 0n;
    const myNo = (userData?.[i * 3 + 1]?.result as bigint | undefined) ?? 0n;
    const myClaimable = (userData?.[i * 3 + 2]?.result as bigint | undefined) ?? 0n;

    return {
      id: i,
      commodityId,
      symbol: meta?.symbol ?? `#${commodityId}`,
      glyph: marketMeta(meta?.symbol ?? "").glyph,
      thresholdE8: m ? m.thresholdE8 : 0n,
      expiry,
      isAbove: m ? m.isAbove : true,
      status,
      outcomeYes: m ? m.outcomeYes : false,
      yesPool: m ? m.yesPool : 0n,
      noPool: m ? m.noPool : 0n,
      winnerPool: m ? m.winnerPool : 0n,
      netLosingPool: m ? m.netLosingPool : 0n,
      resolvedPrice: m ? m.resolvedPrice : 0n,
      yesBps: o ? Number(o[0]) : 0,
      noBps: o ? Number(o[1]) : 0,
      currentPriceE8: meta?.priceE8 ?? 0n,
      phase,
      myYes,
      myNo,
      myClaimable,
      claimed: false,
    };
  });

  function refetchAll() {
    refetchCount();
    refetchBase();
    refetchUser();
  }

  return { predictions, count, feeBps, isLoading, refetch: refetchAll };
}

/**
 * Estimated parimutuel payout for staking `amount` wei on `isYes`, at the CURRENT pools. Real payout
 * moves as others bet, so label this "≈". Payout = stake + stake · netLosingPool / (winnerPool + stake).
 * Returns { payout, profit, multiple }. When the opposing pool is empty, multiple ≈ 1 (only stake back).
 */
export function estimatePayout(
  p: PredictionInfo,
  isYes: boolean,
  amount: bigint,
  feeBps: number
): { payout: bigint; profit: bigint; multipleX: number } {
  if (amount <= 0n) return { payout: 0n, profit: 0n, multipleX: 1 };
  const winnerPool = (isYes ? p.yesPool : p.noPool) + amount;
  const losingPool = isYes ? p.noPool : p.yesPool;
  const fee = (losingPool * BigInt(feeBps)) / 10_000n;
  const netLosing = losingPool - fee;
  const payout = amount + (amount * netLosing) / winnerPool;
  const profit = payout - amount;
  const multipleX = Number(payout) / Number(amount);
  return { payout, profit, multipleX };
}
