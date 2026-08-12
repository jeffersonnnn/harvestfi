/// Keeper-side source of truth for how each listed commodity is quoted on Trading Economics.
///
/// `commodityId` MUST match the on-chain registry order (see contracts/script/Deploy.s.sol).
/// `currency` is the ACTUAL Trading Economics quote currency, which the on-chain registry does not
/// store reliably (it records "USD" for display). This is where the cents-vs-dollars distinction
/// lives: grains/softs are quoted in US cents ("USd"), metals/energy/rice in dollars ("USD").
/// See contracts/KEEPER.md.

export interface CommoditySpec {
    id: bigint;
    symbol: string; // on-chain registry symbol
    teSlug: string; // Trading Economics identifier (for the API/source adapter)
    currency: string; // ACTUAL TE quote currency: "USD" | "USd" (cents) | "EUR" | "GBp" | ...
    unit: string; // display only
}

export const COMMODITIES: CommoditySpec[] = [
    {id: 0n, symbol: "GOLD", teSlug: "gold", currency: "USD", unit: "t.oz"},
    {id: 1n, symbol: "SILVER", teSlug: "silver", currency: "USD", unit: "t.oz"},
    {id: 2n, symbol: "COPPER", teSlug: "copper", currency: "USD", unit: "Lbs"},
    {id: 3n, symbol: "PLATINUM", teSlug: "platinum", currency: "USD", unit: "t.oz"},
    {id: 4n, symbol: "CRUDE_OIL", teSlug: "crude-oil", currency: "USD", unit: "Bbl"},
    {id: 5n, symbol: "NATURAL_GAS", teSlug: "natural-gas", currency: "USD", unit: "MMBtu"},
    // Grains & softs: Trading Economics quotes these in US CENTS (USd).
    {id: 6n, symbol: "CORN", teSlug: "corn", currency: "USd", unit: "Bu"},
    {id: 7n, symbol: "WHEAT", teSlug: "wheat", currency: "USd", unit: "Bu"},
    {id: 8n, symbol: "RICE", teSlug: "rice", currency: "USD", unit: "cwt"}, // rice is in dollars
    {id: 9n, symbol: "SOYBEANS", teSlug: "soybeans", currency: "USd", unit: "Bu"},
    {id: 10n, symbol: "COFFEE", teSlug: "coffee", currency: "USd", unit: "Lbs"},
    {id: 11n, symbol: "SUGAR", teSlug: "sugar", currency: "USd", unit: "Lbs"},
    {id: 12n, symbol: "COTTON", teSlug: "cotton", currency: "USd", unit: "Lbs"},
];

export const COMMODITIES_BY_SYMBOL: Record<string, CommoditySpec> = Object.fromEntries(
    COMMODITIES.map((c) => [c.symbol, c]),
);
