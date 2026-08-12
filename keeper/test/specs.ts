import {type CommoditySpec} from "../src/commodities.js";

/// Fixed commodity specs for SOURCE tests — deliberately independent of the production catalog
/// (commodities.ts), so changing the tradable market set doesn't break tests of source/normalize
/// logic. Includes metals (for the pyth/yahoo source tests) even though the live product is ag-only.
const SPECS: Record<string, CommoditySpec> = {
    GOLD: {id: 0n, symbol: "GOLD", teSlug: "gold", currency: "USD", unit: "t.oz"},
    SILVER: {id: 1n, symbol: "SILVER", teSlug: "silver", currency: "USD", unit: "t.oz"},
    CORN: {id: 2n, symbol: "CORN", teSlug: "corn", currency: "USd", unit: "Bu"},
    WHEAT: {id: 3n, symbol: "WHEAT", teSlug: "wheat", currency: "USd", unit: "Bu"},
    RICE: {id: 4n, symbol: "RICE", teSlug: "rice", currency: "USD", unit: "cwt"},
    SOYBEANS: {id: 5n, symbol: "SOYBEANS", teSlug: "soybeans", currency: "USd", unit: "Bu"},
    COFFEE: {id: 6n, symbol: "COFFEE", teSlug: "coffee", currency: "USd", unit: "Lbs"},
    SUGAR: {id: 7n, symbol: "SUGAR", teSlug: "sugar", currency: "USd", unit: "Lbs"},
    COTTON: {id: 8n, symbol: "COTTON", teSlug: "cotton", currency: "USd", unit: "Lbs"},
};

export const spec = (symbol: string): CommoditySpec => {
    const c = SPECS[symbol];
    if (!c) throw new Error(`no test spec for ${symbol}`);
    return c;
};
