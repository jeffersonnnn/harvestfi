/// Keeper CATALOG: how each known commodity is quoted on Trading Economics.
///
/// This is the superset of everything the keeper knows how to price. The ACTIVE market set (and the
/// real on-chain ids) comes from the registry via `discoverMarkets` — so shipping a new market is:
///   1. add its row here (symbol -> teSlug + true currency), and
///   2. `registry.list(...)` it on-chain (owner tx).
/// No other keeper change. The `id` below is only a fallback ordering for offline dry-runs; on-chain
/// ids are whatever `registry.list` order assigns.
///
/// `currency` is the ACTUAL TE quote currency (the registry stores "USD" for display and cannot be
/// trusted for this). It drives normalize: "USd" = US cents (÷100), "USD" = dollars, everything else
/// (EUR/CAD/INR/MYR/AUD/...) is multiplied by a live foreign->USD FX rate. See normalize.ts + fx.ts.

export interface CommoditySpec {
    id: bigint;
    symbol: string; // on-chain registry symbol
    teSlug: string; // Trading Economics /commodity/<slug>
    currency: string; // ACTUAL TE quote currency: "USD" | "USd" (cents) | "EUR" | "CAD" | "INR" | ...
    unit: string; // display only
}

export const COMMODITIES: CommoditySpec[] = [
    // --- Metals + Energy (ids 0–5, matching the current testnet registry) ---
    {id: 0n, symbol: "GOLD", teSlug: "gold", currency: "USD", unit: "t.oz"},
    {id: 1n, symbol: "SILVER", teSlug: "silver", currency: "USD", unit: "t.oz"},
    {id: 2n, symbol: "COPPER", teSlug: "copper", currency: "USD", unit: "Lbs"},
    {id: 3n, symbol: "PLATINUM", teSlug: "platinum", currency: "USD", unit: "t.oz"},
    {id: 4n, symbol: "CRUDE_OIL", teSlug: "crude-oil", currency: "USD", unit: "Bbl"},
    {id: 5n, symbol: "NATURAL_GAS", teSlug: "natural-gas", currency: "USD", unit: "MMBtu"},

    // --- Agricultural (all 23 on TE). USd = US cents. FX-quoted ones flagged. ---
    // The 7 launch "fighters" first (ids 6–12, matching current testnet), then the rest.
    {id: 6n, symbol: "CORN", teSlug: "corn", currency: "USd", unit: "Bu"},
    {id: 7n, symbol: "WHEAT", teSlug: "wheat", currency: "USd", unit: "Bu"},
    {id: 8n, symbol: "RICE", teSlug: "rice", currency: "USD", unit: "cwt"},
    {id: 9n, symbol: "SOYBEANS", teSlug: "soybeans", currency: "USd", unit: "Bu"},
    {id: 10n, symbol: "COFFEE", teSlug: "coffee", currency: "USd", unit: "Lbs"},
    {id: 11n, symbol: "SUGAR", teSlug: "sugar", currency: "USd", unit: "Lbs"},
    {id: 12n, symbol: "COTTON", teSlug: "cotton", currency: "USd", unit: "Lbs"},
    // Rest of agricultural — clean USD/USd (no FX):
    {id: 13n, symbol: "OAT", teSlug: "oat", currency: "USd", unit: "Bu"},
    {id: 14n, symbol: "ORANGE_JUICE", teSlug: "orange-juice", currency: "USd", unit: "Lbs"},
    {id: 15n, symbol: "CHEESE", teSlug: "cheese", currency: "USD", unit: "Lbs"},
    {id: 16n, symbol: "COCOA", teSlug: "cocoa", currency: "USD", unit: "T"},
    {id: 17n, symbol: "LUMBER", teSlug: "lumber", currency: "USD", unit: "board-ft"},
    {id: 18n, symbol: "MILK", teSlug: "milk", currency: "USD", unit: "cwt"},
    {id: 19n, symbol: "RUBBER", teSlug: "rubber", currency: "USd", unit: "Kg"}, // TE unit "USD Cents / Kg" = cents
    // Agricultural quoted in FOREIGN currency — require the FX path (normalize applies foreign->USD):
    {id: 20n, symbol: "BUTTER", teSlug: "butter", currency: "EUR", unit: "T"},
    {id: 21n, symbol: "POTATOES", teSlug: "potatoes", currency: "EUR", unit: "100kg"},
    {id: 22n, symbol: "RAPESEED", teSlug: "rapeseed-oil", currency: "EUR", unit: "T"},
    {id: 23n, symbol: "CANOLA", teSlug: "canola", currency: "CAD", unit: "T"},
    {id: 24n, symbol: "BARLEY", teSlug: "barley", currency: "INR", unit: "T"},
    {id: 25n, symbol: "SUNFLOWER_OIL", teSlug: "sunflower-oil", currency: "INR", unit: "10kg"},
    {id: 26n, symbol: "TEA", teSlug: "tea", currency: "INR", unit: "Kg"},
    {id: 27n, symbol: "PALM_OIL", teSlug: "palm-oil", currency: "MYR", unit: "T"},
    {id: 28n, symbol: "WOOL", teSlug: "wool", currency: "AUD", unit: "100kg"},
];

export const COMMODITIES_BY_SYMBOL: Record<string, CommoditySpec> = Object.fromEntries(
    COMMODITIES.map((c) => [c.symbol, c]),
);
