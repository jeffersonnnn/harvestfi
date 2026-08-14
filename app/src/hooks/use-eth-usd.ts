"use client";

import { useEffect, useState } from "react";

/** ETH/USD for denominating coin prices + market caps. Falls back to a constant if the fetch fails. */
export function useEthUsd(fallback = 3500) {
  const [eth, setEth] = useState(fallback);
  useEffect(() => {
    let cancelled = false;
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
      .then((r) => r.json())
      .then((j) => {
        const v = Number(j?.ethereum?.usd);
        if (!cancelled && v > 0) setEth(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return eth;
}
