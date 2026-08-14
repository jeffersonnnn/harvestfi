"use client";

import { useState } from "react";
import { type Address } from "viem";

/**
 * Trade panel for a launched coin. Ships the live UI + a real price estimate now.
 * The one-click in-app v4 swap (UniversalRouter) is wired + live-tested in the next update;
 * until then the primary action opens the coin's pool to trade.
 */
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
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const tk = symbol ?? "coin";

  const amt = parseFloat(amount) || 0;
  // Buy: spend ETH -> receive coin. Sell: spend coin -> receive ETH. (spot estimate, pre-slippage)
  const estOut =
    side === "buy" ? (priceEth > 0 ? amt / priceEth : 0) : amt * priceEth;
  const estOutLabel = side === "buy" ? tk : "ETH";
  const inLabel = side === "buy" ? "ETH" : tk;

  return (
    <div className="rounded-2xl border border-bone/10 bg-soil-900/40 p-4">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-soil-950 p-1">
        <button
          onClick={() => setSide("buy")}
          className={`rounded-md py-2 text-sm font-medium transition-colors ${
            side === "buy" ? "bg-field/20 text-field" : "text-bone/50 hover:text-bone/80"
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`rounded-md py-2 text-sm font-medium transition-colors ${
            side === "sell" ? "bg-rust/20 text-rust" : "text-bone/50 hover:text-bone/80"
          }`}
        >
          Sell
        </button>
      </div>

      <label className="block">
        <span className="label text-bone/45">You pay ({inLabel})</span>
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

      <a
        href={`https://pools.trade/t/${token}`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 block w-full rounded-full bg-wheat py-3 text-center text-sm font-semibold text-soil-950 transition-colors hover:bg-wheat/90"
      >
        {side === "buy" ? `Buy ${tk} ↗` : `Sell ${tk} ↗`}
      </a>

      <p className="mt-3 text-center text-xs text-bone/40">
        One-click in-app swap is landing next. Estimate uses the live pool price
        {ethUsd ? ` · ETH ~$${ethUsd.toLocaleString()}` : ""}.
      </p>
    </div>
  );
}
