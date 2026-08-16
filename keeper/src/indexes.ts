/// SYNTHETIC INDEX markets: one tradeable/predictable price that tracks a BASKET of real commodities.
///
/// An index is NOT fetched from any source. It is DERIVED each tick from the leaf prices the source
/// already returned, then posted like any other market (perps + predictions read it by commodityId,
/// so they work on an index for free). See tick.ts buildUpdates.
///
/// Method: equal-weight, rebased to 100. index = 100 * mean(leafPrice_i / base_i). `base_i` is the
/// constituent's REFERENCE price in USD (the keeper anchor, i.e. its normalized rest value), so at
/// rest every ratio is 1 and the index sits at exactly 100.00. This is source-agnostic: whatever the
/// leaves resolve to (simulated / yahoo / pyth), the index tracks their average % move.
///
/// To ship an index: add its def here, add a `synthetic: true` catalog row in commodities.ts, and
/// `registry.list(...)` it on-chain (owner tx, script/ListIndexes.s.sol). No source change.

export interface IndexDef {
    symbol: string; // on-chain registry symbol, e.g. "ENERGY_INDEX"
    /// Constituent leaf symbols + their reference USD price (must equal the leaf's normalized anchor
    /// so the index rests at 100). Keep these in sync with the SIM anchors in sources.ts.
    constituents: {symbol: string; base: number}[];
}

export const INDEXES: IndexDef[] = [
    {
        symbol: "ENERGY_INDEX",
        constituents: [
            {symbol: "CRUDE_OIL", base: 78},
            {symbol: "BRENT_CRUDE", base: 82},
            {symbol: "NATURAL_GAS", base: 2.9},
            {symbol: "GASOLINE", base: 2.35},
            {symbol: "HEATING_OIL", base: 2.5},
        ],
    },
    {
        symbol: "METALS_INDEX",
        constituents: [
            {symbol: "COPPER", base: 9200},
            {symbol: "ALUMINUM", base: 2400},
            {symbol: "ZINC", base: 2700},
            {symbol: "NICKEL", base: 16500},
            {symbol: "PALLADIUM", base: 1000},
        ],
    },
    {
        symbol: "GRAIN_INDEX",
        constituents: [
            {symbol: "CORN", base: 4.4171},
            {symbol: "WHEAT", base: 6.3757},
            {symbol: "SOYBEANS", base: 11.5254},
            {symbol: "SUGAR", base: 0.1506},
            {symbol: "COFFEE", base: 3.2305},
            {symbol: "COTTON", base: 0.8237},
        ],
    },
];

export const INDEXES_BY_SYMBOL: Record<string, IndexDef> = Object.fromEntries(
    INDEXES.map((d) => [d.symbol, d]),
);

export const INDEX_SYMBOLS: ReadonlySet<string> = new Set(INDEXES.map((d) => d.symbol));

const E8 = 100_000_000; // 1e8 scale (matches normalize.ts PRICE_DECIMALS)

/// Derive one index's price (1e8-USD bigint) from the leaf prices posted this tick. `leafE8` maps a
/// leaf symbol to its normalized 1e8-USD price. Skips constituents that have no price this tick, and
/// returns null if fewer than half resolved (too thin to be a trustworthy basket).
export function deriveIndexE8(def: IndexDef, leafE8: Map<string, bigint>): bigint | null {
    let sumRatio = 0;
    let have = 0;
    for (const c of def.constituents) {
        const leaf = leafE8.get(c.symbol);
        if (leaf === undefined || leaf <= 0n) continue;
        sumRatio += Number(leaf) / (c.base * E8);
        have++;
    }
    if (have === 0 || have * 2 < def.constituents.length) return null;
    const indexUsd = 100 * (sumRatio / have);
    if (!(indexUsd > 0)) return null;
    return BigInt(Math.round(indexUsd * E8));
}
