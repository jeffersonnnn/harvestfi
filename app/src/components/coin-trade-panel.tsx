"use client";

import { useState } from "react";
import { useAccount, useBalance, usePublicClient, useReadContract, useSendTransaction, useWriteContract } from "wagmi";
import { erc20Abi, formatEther, formatUnits, maxUint256, parseEther, parseUnits, type Address } from "viem";
import { CHAIN_ID } from "@/lib/chain";
import {
  buildExactInSwap,
  UNIVERSAL_ROUTER,
  PERMIT2,
  permit2Abi,
  erc20AllowanceAbi,
} from "@/lib/coin-market";

const MAX_UINT160 = (1n << 160n) - 1n;
const SLIPPAGE = 0.08; // 8% — memecoin pools are thin

/** In-app Buy/Sell for a launched coin, swapping ETH <-> coin on its Uniswap v4 pool. */
export function CoinTradePanel({
  token,
  symbol,
  priceEth,
  ethUsd,
}: {
  token: Address;
  symbol?: string;
  priceEth: number;
  ethUsd: number;
}) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const tk = symbol ?? "coin";

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<"idle" | "working" | "done" | "error">("idle");
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  const { data: ethBal } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address } });
  const { data: coinBal, refetch: refetchCoin } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  });

  const amt = parseFloat(amount) || 0;
  const estOut = side === "buy" ? (priceEth > 0 ? amt / priceEth : 0) : amt * priceEth;
  const estOutLabel = side === "buy" ? tk : "ETH";
  const inLabel = side === "buy" ? "ETH" : tk;
  const balance =
    side === "buy"
      ? ethBal
        ? Number(formatEther(ethBal.value))
        : 0
      : coinBal !== undefined
        ? Number(formatUnits(coinBal as bigint, 18))
        : 0;

  async function trade() {
    if (!publicClient || !address || amt <= 0) return;
    setPhase("working");
    setError("");
    try {
      if (side === "buy") {
        const amountIn = parseEther(amount);
        const minOut = BigInt(Math.floor(estOut * (1 - SLIPPAGE) * 1e18));
        const { to, data, value } = buildExactInSwap({ token, zeroForOne: true, amountIn, amountOutMin: minOut });
        setStep("Confirm the buy in your wallet…");
        const hash = await sendTransactionAsync({ to, data, value, chainId: CHAIN_ID });
        setStep("Buying…");
        await publicClient.waitForTransactionReceipt({ hash });
      } else {
        const amountIn = parseUnits(amount, 18);
        const minOut = BigInt(Math.floor(estOut * (1 - SLIPPAGE) * 1e18));

        // 1. ERC20 allowance token -> Permit2
        const erc20Allow = (await publicClient.readContract({
          address: token,
          abi: erc20AllowanceAbi,
          functionName: "allowance",
          args: [address, PERMIT2],
        })) as bigint;
        if (erc20Allow < amountIn) {
          setStep("Approve the token (1/2)…");
          const h = await writeContractAsync({
            address: token,
            abi: erc20AllowanceAbi,
            functionName: "approve",
            args: [PERMIT2, maxUint256],
            chainId: CHAIN_ID,
          });
          await publicClient.waitForTransactionReceipt({ hash: h });
        }

        // 2. Permit2 allowance -> UniversalRouter
        const [pAmt, pExp] = (await publicClient.readContract({
          address: PERMIT2,
          abi: permit2Abi,
          functionName: "allowance",
          args: [address, token, UNIVERSAL_ROUTER],
        })) as readonly [bigint, number, number];
        const now = Math.floor(Date.now() / 1000);
        if (pAmt < amountIn || Number(pExp) < now + 60) {
          setStep("Approve the router (2/2)…");
          const h = await writeContractAsync({
            address: PERMIT2,
            abi: permit2Abi,
            functionName: "approve",
            args: [token, UNIVERSAL_ROUTER, MAX_UINT160, now + 30 * 24 * 3600],
            chainId: CHAIN_ID,
          });
          await publicClient.waitForTransactionReceipt({ hash: h });
        }

        // 3. Swap
        const { to, data, value } = buildExactInSwap({ token, zeroForOne: false, amountIn, amountOutMin: minOut });
        setStep("Confirm the sell in your wallet…");
        const hash = await sendTransactionAsync({ to, data, value, chainId: CHAIN_ID });
        setStep("Selling…");
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setAmount("");
      refetchCoin();
      setPhase("done");
      setTimeout(() => setPhase("idle"), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Trade failed");
      setPhase("error");
    }
  }

  const disabled = !isConnected || amt <= 0 || amt > balance || phase === "working";

  return (
    <div className="rounded-2xl border border-bone/10 bg-soil-900/40 p-4">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-soil-950 p-1">
        <button
          onClick={() => setSide("buy")}
          className={`rounded-md py-2 text-sm font-medium transition-colors ${side === "buy" ? "bg-field/20 text-field" : "text-bone/50 hover:text-bone/80"}`}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`rounded-md py-2 text-sm font-medium transition-colors ${side === "sell" ? "bg-rust/20 text-rust" : "text-bone/50 hover:text-bone/80"}`}
        >
          Sell
        </button>
      </div>

      <label className="block">
        <div className="flex items-center justify-between">
          <span className="label text-bone/45">You pay ({inLabel})</span>
          <button
            onClick={() => setAmount(String(side === "buy" ? Math.max(0, balance - 0.0005) : balance))}
            className="label text-wheat hover:underline"
          >
            max {balance.toLocaleString(undefined, { maximumSignificantDigits: 4 })}
          </button>
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          placeholder="0.0"
          className="tnum mt-1.5 w-full rounded-lg border border-bone/15 bg-soil-950 px-3 py-2.5 text-lg outline-none focus:border-wheat/50"
        />
      </label>

      <div className="mt-3 rounded-lg border border-bone/10 bg-soil-950/60 px-3 py-2.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-bone/45">You receive (est.)</span>
          <span className="tnum">
            {estOut > 0 ? estOut.toLocaleString(undefined, { maximumSignificantDigits: 6 }) : "0"} {estOutLabel}
          </span>
        </div>
      </div>

      {phase === "error" && <p className="mt-2 text-xs text-rust">{error}</p>}
      {phase === "working" && <p className="mt-2 text-xs text-wheat">{step}</p>}
      {phase === "done" && <p className="mt-2 text-xs text-field">Done.</p>}

      <button
        disabled={disabled}
        onClick={trade}
        className={`mt-4 w-full rounded-full py-3 text-sm font-semibold transition-colors disabled:opacity-40 ${
          side === "buy" ? "bg-field text-soil-950 hover:bg-field/90" : "bg-rust text-soil-950 hover:bg-rust/90"
        }`}
      >
        {phase === "working"
          ? "Working…"
          : !isConnected
            ? "Connect wallet"
            : amt > balance
              ? "Insufficient balance"
              : side === "buy"
                ? `Buy ${tk}`
                : `Sell ${tk}`}
      </button>

      <p className="mt-3 text-center text-xs text-bone/40">
        Swaps on the coin&apos;s Uniswap v4 pool · {Math.round(SLIPPAGE * 100)}% max slippage
        {ethUsd ? ` · ETH ~$${ethUsd.toLocaleString()}` : ""}
      </p>
    </div>
  );
}
