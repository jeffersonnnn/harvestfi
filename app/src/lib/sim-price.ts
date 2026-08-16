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
  // Industrial metals (USD-quoted; anchors mirror keeper/src/sources.ts SIM). Present so METALS_INDEX
  // can be computed client-side from its constituents; also gives these five a smooth client ticker.
  COPPER: { price: 9200, vol: 0.07 },
  ALUMINUM: { price: 2400, vol: 0.06 },
  ZINC: { price: 2700, vol: 0.08 },
  NICKEL: { price: 16500, vol: 0.1 },
  PALLADIUM: { price: 1000, vol: 0.1 },
  // Energy (all USD-quoted → client model applies; anchors mirror keeper/src/sources.ts SIM)
  CRUDE_OIL: { price: 78, vol: 0.08 },
  BRENT_CRUDE: { price: 82, vol: 0.08 },
  NATURAL_GAS: { price: 2.9, vol: 0.18 },
  GASOLINE: { price: 2.35, vol: 0.1 },
  HEATING_OIL: { price: 2.5, vol: 0.1 },
  GASOIL: { price: 720, vol: 0.09 },
  TTF_GAS: { price: 34, vol: 0.2 },
  UK_GAS: { price: 1.0, vol: 0.2 },
  ETHANOL: { price: 1.7, vol: 0.1 },
  NAPHTHA: { price: 620, vol: 0.1 },
  PROPANE: { price: 0.75, vol: 0.12 },
  CARBON_EU: { price: 72, vol: 0.12 },
  LNG_JKM: { price: 13, vol: 0.2 },
  METHANOL: { price: 320, vol: 0.1 },
  POWER_DE: { price: 90, vol: 0.22 },
  POWER_FR: { price: 85, vol: 0.22 },
  BITUMEN: { price: 400, vol: 0.12 },
};

// SYNTHETIC INDEX markets: an equal-weight basket rebased to 100 (mirrors keeper/src/indexes.ts).
// index(t) = 100 * mean( leafPrice_i(t) / base_i ), base_i = the leaf's SIM anchor, so the index
// rests at 100. Computed from the same deterministic leaf curves, so the client index matches the
// value the keeper derives and posts on-chain.
interface IndexDef {
  constituents: { symbol: string; base: number }[];
}
const INDEX_DEFS: Record<string, IndexDef> = {
  ENERGY_INDEX: {
    constituents: [
      { symbol: "CRUDE_OIL", base: 78 },
      { symbol: "BRENT_CRUDE", base: 82 },
      { symbol: "NATURAL_GAS", base: 2.9 },
      { symbol: "GASOLINE", base: 2.35 },
      { symbol: "HEATING_OIL", base: 2.5 },
    ],
  },
  METALS_INDEX: {
    constituents: [
      { symbol: "COPPER", base: 9200 },
      { symbol: "ALUMINUM", base: 2400 },
      { symbol: "ZINC", base: 2700 },
      { symbol: "NICKEL", base: 16500 },
      { symbol: "PALLADIUM", base: 1000 },
    ],
  },
  GRAIN_INDEX: {
    constituents: [
      { symbol: "CORN", base: 4.4171 },
      { symbol: "WHEAT", base: 6.3757 },
      { symbol: "SOYBEANS", base: 11.5254 },
      { symbol: "SUGAR", base: 0.1506 },
      { symbol: "COFFEE", base: 3.2305 },
      { symbol: "COTTON", base: 0.8237 },
    ],
  },
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
  return symbol in SIM_USD || symbol in INDEX_DEFS;
}

/// The simulated USD price at a given unix second — the exact deterministic curve the keeper posts.
/// Sampling this faster than the on-chain post cadence gives a smooth "live" price that still passes
/// through every on-chain value. Returns null for markets without a client model.
/// Synthetic indexes are computed from their constituents (equal-weight, rebased to 100), matching
/// keeper/src/indexes.ts, so an index curve also passes through the on-chain values.
export function simPriceUsdAt(symbol: string, tsSec: number): number | null {
  const idx = INDEX_DEFS[symbol];
  if (idx) {
    let sumRatio = 0;
    let have = 0;
    for (const c of idx.constituents) {
      const leaf = simPriceUsdAt(c.symbol, tsSec);
      if (leaf == null || !(leaf > 0)) continue;
      sumRatio += leaf / c.base;
      have++;
    }
    if (have === 0 || have * 2 < idx.constituents.length) return null;
    return 100 * (sumRatio / have);
  }
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
