// Client-side mirror of the keeper's SIMULATED price model (keeper/src/sources.ts), used only to
// backfill the chart with instant, dense history when NEXT_PUBLIC_SIMULATED_PRICES is on. It is a pure
// deterministic function of the clock, so the curve it draws matches what the keeper posted on-chain.
//
// Only the NON-FX markets are here (USd/USD quotes), where the on-chain USD price is simply
// anchorUSD * (1 + fbm*vol). FX-quoted markets (EUR/CAD/INR/MYR/AUD) need a live FX rate we do not have
// client-side, so those fall back to live polling.

interface Sim {
  price: number; // anchor already in USD (keeper's native anchor, cents converted to dollars)
  vol: number;
}
const SIM_USD: Record<string, Sim> = {
  CORN: { price: 4.4171, vol: 0.05 },
  WHEAT: { price: 6.3757, vol: 0.06 },
  RICE: { price: 13.93, vol: 0.05 },
  SOYBEANS: { price: 11.5254, vol: 0.05 },
  COFFEE: { price: 3.2305, vol: 0.1 },
  SUGAR: { price: 0.1506, vol: 0.08 },
  COTTON: { price: 0.8237, vol: 0.06 },
  OAT: { price: 3.85, vol: 0.06 },
  ORANGE_JUICE: { price: 3.1, vol: 0.1 },
  CHEESE: { price: 1.85, vol: 0.05 },
  COCOA: { price: 8200, vol: 0.12 },
  LUMBER: { price: 600, vol: 0.08 },
  MILK: { price: 19.5, vol: 0.06 },
  RUBBER: { price: 1.7, vol: 0.07 },
};

function simSeed(sym: string): number {
  let h = 2166136261;
  for (let i = 0; i < sym.length; i++) {
    h ^= sym.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}
const hash01 = (x: number) => {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function vnoise(seed: number, t: number, period: number): number {
  const x = t / period + seed;
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(i);
  const b = hash01(i + 1);
  return (a + (b - a) * u) * 2 - 1;
}
function fbm(seed: number, t: number): number {
  return (
    0.45 * vnoise(seed, t, 172800) +
    0.3 * vnoise(seed + 11, t, 7200) +
    0.15 * vnoise(seed + 23, t, 900) +
    0.1 * vnoise(seed + 41, t, 180)
  );
}

export function hasSimModel(symbol: string): boolean {
  return symbol in SIM_USD;
}

/// The simulated USD price at a given unix second — the exact deterministic curve the keeper posts.
/// Sampling this faster than the on-chain post cadence gives a smooth "live" price that still passes
/// through every on-chain value. Returns null for markets without a client model.
export function simPriceUsdAt(symbol: string, tsSec: number): number | null {
  const cfg = SIM_USD[symbol];
  if (!cfg) return null;
  return cfg.price * (1 + fbm(simSeed(symbol), tsSec) * cfg.vol);
}

/// The simulated price right now as a 1e8-USD bigint (for display next to on-chain prices). Null if no model.
export function simPriceE8Now(symbol: string): bigint | null {
  const usd = simPriceUsdAt(symbol, Math.floor(Date.now() / 1000));
  return usd == null ? null : BigInt(Math.round(usd * 1e8));
}

/// Dense backfill for the chart: `count` points ending now, `stepSec` apart, as {ts, price(1e8 string)}.
export function simBackfill(symbol: string, count = 120, stepSec = 60): { ts: number; price: string }[] {
  if (!hasSimModel(symbol)) return [];
  const now = Math.floor(Date.now() / 1000);
  const out: { ts: number; price: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ts = now - i * stepSec;
    const usd = simPriceUsdAt(symbol, ts)!;
    out.push({ ts, price: String(Math.round(usd * 1e8)) });
  }
  return out;
}
