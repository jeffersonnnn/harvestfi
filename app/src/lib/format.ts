import { formatEther, formatUnits } from "viem";
import { PRICE_DECIMALS } from "./contracts";

export function formatETH(wei: bigint, decimals = 4): string {
  const [int, frac = ""] = formatEther(wei).split(".");
  return frac ? `${int}.${frac.slice(0, decimals)}` : int;
}

/** Oracle price (int256, 1e8 USD) → "$X.XX" per unit. */
export function formatUsdPrice(price: bigint, display = 2): string {
  const n = Number(formatUnits(price, PRICE_DECIMALS));
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: display,
    maximumFractionDigits: n < 1 ? 4 : display,
  });
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
