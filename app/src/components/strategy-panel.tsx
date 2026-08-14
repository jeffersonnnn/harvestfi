"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { formatEther, type Address } from "viem";
import { CHAIN_ID } from "@/lib/chain";
import { BENEFICIARY_VAULT, beneficiaryVaultAbi } from "@/lib/launchpad";
import { strategyVaultAbi } from "@/lib/strategy-vault";
import { prettyName } from "@/lib/commodities-meta";

/** If a coin's fee NFT is owned by a StrategyVault, show the live strategy: direction, leverage,
 *  open position + PnL, total burned. Renders nothing for a plain (collect-fees) coin. */
export function StrategyPanel({
  positionId,
  marketSymbol,
  ethUsd,
}: {
  positionId?: bigint;
  marketSymbol?: string;
  ethUsd: number;
}) {
  const { data: owner } = useReadContract({
    address: BENEFICIARY_VAULT,
    abi: beneficiaryVaultAbi,
    functionName: "ownerOf",
    args: positionId !== undefined ? [positionId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: positionId !== undefined },
  });
  const vault = owner as Address | undefined;

  const { data } = useReadContracts({
    chainId: CHAIN_ID,
    contracts: vault
      ? ([
          { address: vault, abi: strategyVaultAbi, functionName: "isLong" },
          { address: vault, abi: strategyVaultAbi, functionName: "leverageX" },
          { address: vault, abi: strategyVaultAbi, functionName: "openPositionId" },
          { address: vault, abi: strategyVaultAbi, functionName: "currentPnl" },
          { address: vault, abi: strategyVaultAbi, functionName: "totalBurned" },
          { address: vault, abi: strategyVaultAbi, functionName: "pot" },
          { address: vault, abi: strategyVaultAbi, functionName: "cycles" },
        ] as const)
      : [],
    query: { enabled: !!vault, refetchInterval: 15000 },
  });

  if (!vault || !data || data[0]?.status !== "success") return null; // not a strategy coin

  const isLong = data[0].result as boolean;
  const leverageX = Number(data[1]?.result ?? 0);
  const openPositionId = (data[2]?.result as bigint | undefined) ?? 0n;
  const pnl = (data[3]?.result as bigint | undefined) ?? 0n;
  const burned = (data[4]?.result as bigint | undefined) ?? 0n;
  const pot = (data[5]?.result as bigint | undefined) ?? 0n;
  const cycles = Number(data[6]?.result ?? 0);
  const open = openPositionId !== 0n;
  const pnlEth = Number(formatEther(pnl < 0n ? -pnl : pnl)) * (pnl < 0n ? -1 : 1);

  return (
    <div className="rounded-2xl border border-wheat/25 bg-soil-900/40 p-4">
      <div className="flex items-center justify-between">
        <span className="label text-wheat">Strategy</span>
        <span className={`label ${isLong ? "text-field" : "text-rust"}`}>
          {leverageX}x {isLong ? "long" : "short"}
          {marketSymbol ? ` · ${prettyName(marketSymbol)}` : ""}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-bone/55">
        Creator fees run this leveraged position; take-profit closes and buys back + burns the coin.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Cell label="Position" value={open ? "open" : "waiting for fees"} accent={open} />
        <Cell
          label="Unrealized PnL"
          value={open ? `${pnl < 0n ? "-" : "+"}$${Math.abs(pnlEth * ethUsd).toFixed(2)}` : "—"}
          tone={pnl < 0n ? "down" : "up"}
        />
        <Cell label="Total burned" value={`${Number(formatEther(burned)).toLocaleString(undefined, { maximumSignificantDigits: 4 })} ${""}`} />
        <Cell label="Cycles" value={String(cycles)} />
        <Cell label="Fee pot" value={`${Number(formatEther(pot)).toFixed(4)} ETH`} />
      </dl>
    </div>
  );
}

function Cell({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: "up" | "down" }) {
  const color = tone === "down" ? "text-rust" : tone === "up" ? "text-field" : accent ? "text-field" : "text-bone";
  return (
    <div className="rounded-lg border border-bone/10 bg-soil-950/50 px-3 py-2">
      <div className="label text-bone/45">{label}</div>
      <div className={`tnum mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
