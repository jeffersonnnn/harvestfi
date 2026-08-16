/// Keeper CATALOG: how each known commodity is quoted on Trading Economics.
///
/// This is the superset of everything the keeper knows how to price. The ACTIVE market set (and the
/// real on-chain ids) comes from the registry via `discoverMarkets` - so shipping a new market is:
///   1. add its row here (symbol -> teSlug + true currency), and
///   2. `registry.list(...)` it on-chain (owner tx).
/// No other keeper change. The `id` below is only a fallback ordering for offline dry-runs; on-chain
/// ids are whatever `registry.list` order assigns.
///
/// SCOPE: agricultural only - the product is a farm-commodities perp DEX. Metals/energy/livestock/
/// industrial are intentionally NOT here; add them (same pattern) when expanding beyond agriculture.
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
    synthetic?: boolean; // SYNTHETIC index market: NOT fetched from a source; DERIVED from leaves. See indexes.ts.
}

// All 23 TE agricultural markets. USd = US cents. FX-quoted ones flagged.
// The 7 launch "fighters" first (ids 0-6), then the rest - this is also the mainnet list order.
export const COMMODITIES: CommoditySpec[] = [
    // --- Launch fighters ---
    {id: 0n, symbol: "CORN", teSlug: "corn", currency: "USd", unit: "Bu"},
    {id: 1n, symbol: "WHEAT", teSlug: "wheat", currency: "USd", unit: "Bu"},
    {id: 2n, symbol: "RICE", teSlug: "rice", currency: "USD", unit: "cwt"},
    {id: 3n, symbol: "SOYBEANS", teSlug: "soybeans", currency: "USd", unit: "Bu"},
    {id: 4n, symbol: "COFFEE", teSlug: "coffee", currency: "USd", unit: "Lbs"},
    {id: 5n, symbol: "SUGAR", teSlug: "sugar", currency: "USd", unit: "Lbs"},
    {id: 6n, symbol: "COTTON", teSlug: "cotton", currency: "USd", unit: "Lbs"},
    // --- Rest of agricultural: clean USD/USd (no FX) ---
    {id: 7n, symbol: "OAT", teSlug: "oat", currency: "USd", unit: "Bu"},
    {id: 8n, symbol: "ORANGE_JUICE", teSlug: "orange-juice", currency: "USd", unit: "Lbs"},
    {id: 9n, symbol: "CHEESE", teSlug: "cheese", currency: "USD", unit: "Lbs"},
    {id: 10n, symbol: "COCOA", teSlug: "cocoa", currency: "USD", unit: "T"},
    {id: 11n, symbol: "LUMBER", teSlug: "lumber", currency: "USD", unit: "board-ft"},
    {id: 12n, symbol: "MILK", teSlug: "milk", currency: "USD", unit: "cwt"},
    {id: 13n, symbol: "RUBBER", teSlug: "rubber", currency: "USd", unit: "Kg"}, // TE unit "USD Cents / Kg" = cents
    // --- Agricultural quoted in FOREIGN currency - require the FX path (normalize applies foreign->USD) ---
    {id: 14n, symbol: "BUTTER", teSlug: "butter", currency: "EUR", unit: "T"},
    {id: 15n, symbol: "POTATOES", teSlug: "potatoes", currency: "EUR", unit: "100kg"},
    {id: 16n, symbol: "RAPESEED", teSlug: "rapeseed-oil", currency: "EUR", unit: "T"},
    {id: 17n, symbol: "CANOLA", teSlug: "canola", currency: "CAD", unit: "T"},
    {id: 18n, symbol: "BARLEY", teSlug: "barley", currency: "INR", unit: "T"},
    {id: 19n, symbol: "SUNFLOWER_OIL", teSlug: "sunflower-oil", currency: "INR", unit: "10kg"},
    {id: 20n, symbol: "TEA", teSlug: "tea", currency: "INR", unit: "Kg"},
    {id: 21n, symbol: "PALM_OIL", teSlug: "palm-oil", currency: "MYR", unit: "T"},
    {id: 22n, symbol: "WOOL", teSlug: "wool", currency: "AUD", unit: "100kg"},
    // --- Industrial (28) - metals, steel, battery/critical materials, energy inputs. USD-quoted. ---
    {id: 23n, symbol: "STEEL", teSlug: "steel", currency: "USD", unit: "T"},
    {id: 24n, symbol: "STEEL_REBAR", teSlug: "steel-rebar", currency: "USD", unit: "T"},
    {id: 25n, symbol: "HRC_STEEL", teSlug: "hrc-steel", currency: "USD", unit: "T"},
    {id: 26n, symbol: "IRON_ORE", teSlug: "iron-ore", currency: "USD", unit: "T"},
    {id: 27n, symbol: "COPPER", teSlug: "copper", currency: "USD", unit: "T"},
    {id: 28n, symbol: "ALUMINUM", teSlug: "aluminum", currency: "USD", unit: "T"},
    {id: 29n, symbol: "ZINC", teSlug: "zinc", currency: "USD", unit: "T"},
    {id: 30n, symbol: "NICKEL", teSlug: "nickel", currency: "USD", unit: "T"},
    {id: 31n, symbol: "LEAD", teSlug: "lead", currency: "USD", unit: "T"},
    {id: 32n, symbol: "TIN", teSlug: "tin", currency: "USD", unit: "T"},
    {id: 33n, symbol: "COBALT", teSlug: "cobalt", currency: "USD", unit: "T"},
    {id: 34n, symbol: "LITHIUM", teSlug: "lithium", currency: "USD", unit: "T"},
    {id: 35n, symbol: "MOLYBDENUM", teSlug: "molybdenum", currency: "USD", unit: "T"},
    {id: 36n, symbol: "MANGANESE", teSlug: "manganese", currency: "USD", unit: "T"},
    {id: 37n, symbol: "TITANIUM", teSlug: "titanium", currency: "USD", unit: "T"},
    {id: 38n, symbol: "MAGNESIUM", teSlug: "magnesium", currency: "USD", unit: "T"},
    {id: 39n, symbol: "SILICON", teSlug: "silicon", currency: "USD", unit: "T"},
    {id: 40n, symbol: "ANTIMONY", teSlug: "antimony", currency: "USD", unit: "T"},
    {id: 41n, symbol: "TUNGSTEN", teSlug: "tungsten", currency: "USD", unit: "T"},
    {id: 42n, symbol: "VANADIUM", teSlug: "vanadium", currency: "USD", unit: "T"},
    {id: 43n, symbol: "GRAPHITE", teSlug: "graphite", currency: "USD", unit: "T"},
    {id: 44n, symbol: "URANIUM", teSlug: "uranium", currency: "USD", unit: "Lbs"},
    {id: 45n, symbol: "COAL", teSlug: "coal", currency: "USD", unit: "T"},
    {id: 46n, symbol: "COKING_COAL", teSlug: "coking-coal", currency: "USD", unit: "T"},
    {id: 47n, symbol: "NEODYMIUM", teSlug: "neodymium", currency: "USD", unit: "Kg"},
    {id: 48n, symbol: "GERMANIUM", teSlug: "germanium", currency: "USD", unit: "Kg"},
    {id: 49n, symbol: "GALLIUM", teSlug: "gallium", currency: "USD", unit: "Kg"},
    {id: 50n, symbol: "PALLADIUM", teSlug: "palladium", currency: "USD", unit: "Oz"},
    // --- Energy (17) - oil/gas/fuels/power/carbon. All quoted "USD" for the demo (simulated anchors are
    // rough USD-equivalents; the 5 with USD-futures also carry a Yahoo ticker for the real source). ---
    {id: 51n, symbol: "CRUDE_OIL", teSlug: "crude-oil", currency: "USD", unit: "Bbl"},
    {id: 52n, symbol: "BRENT_CRUDE", teSlug: "brent-crude-oil", currency: "USD", unit: "Bbl"},
    {id: 53n, symbol: "NATURAL_GAS", teSlug: "natural-gas", currency: "USD", unit: "MMBtu"},
    {id: 54n, symbol: "GASOLINE", teSlug: "gasoline", currency: "USD", unit: "Gal"},
    {id: 55n, symbol: "HEATING_OIL", teSlug: "heating-oil", currency: "USD", unit: "Gal"},
    {id: 56n, symbol: "GASOIL", teSlug: "gasoil", currency: "USD", unit: "T"},
    {id: 57n, symbol: "TTF_GAS", teSlug: "eu-natural-gas", currency: "USD", unit: "MWh"},
    {id: 58n, symbol: "UK_GAS", teSlug: "uk-natural-gas", currency: "USD", unit: "thm"},
    {id: 59n, symbol: "ETHANOL", teSlug: "ethanol", currency: "USD", unit: "Gal"},
    {id: 60n, symbol: "NAPHTHA", teSlug: "naphtha", currency: "USD", unit: "T"},
    {id: 61n, symbol: "PROPANE", teSlug: "propane", currency: "USD", unit: "Gal"},
    {id: 62n, symbol: "CARBON_EU", teSlug: "carbon", currency: "USD", unit: "T"},
    {id: 63n, symbol: "LNG_JKM", teSlug: "lng-japan-korea-marker", currency: "USD", unit: "MMBtu"},
    {id: 64n, symbol: "METHANOL", teSlug: "methanol", currency: "USD", unit: "T"},
    {id: 65n, symbol: "POWER_DE", teSlug: "germany-electricity-price", currency: "USD", unit: "MWh"},
    {id: 66n, symbol: "POWER_FR", teSlug: "france-electricity-price", currency: "USD", unit: "MWh"},
    {id: 67n, symbol: "BITUMEN", teSlug: "bitumen", currency: "USD", unit: "T"},
    // --- Synthetic INDEX markets (3) - DERIVED from the leaves above, not fetched. See indexes.ts.
    // `teSlug` is empty and `currency` is nominal: these rows are filtered out before the source fetch;
    // their price is computed from constituent leaf prices and posted directly (bypasses normalize). ---
    {id: 68n, symbol: "ENERGY_INDEX", teSlug: "", currency: "USD", unit: "idx", synthetic: true},
    {id: 69n, symbol: "METALS_INDEX", teSlug: "", currency: "USD", unit: "idx", synthetic: true},
    {id: 70n, symbol: "GRAIN_INDEX", teSlug: "", currency: "USD", unit: "idx", synthetic: true},
];

export const COMMODITIES_BY_SYMBOL: Record<string, CommoditySpec> = Object.fromEntries(
    COMMODITIES.map((c) => [c.symbol, c]),
);
