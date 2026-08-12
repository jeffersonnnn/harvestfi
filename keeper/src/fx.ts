import {config} from "./config.js";

/// Fetch foreign->USD rates for the given currency codes. The starter basket is entirely USD/USd,
/// so this is only exercised once EUR/CNY/GBp/etc. commodities are listed.
///
/// open.er-api.com returns USD-base rates ("1 USD = X foreign"); we invert to foreign->USD.
export async function fetchFxRates(codes: string[]): Promise<Record<string, number>> {
    const needed = codes.filter((c) => c !== "USD" && c !== "USd");
    // GBp (pence) is derived from GBP inside normalize, so request GBP for it.
    const requested = new Set(needed.map((c) => (c === "GBp" ? "GBP" : c)));
    if (requested.size === 0) return {};

    const res = await fetch(config.fxApiUrl);
    if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
    const body = (await res.json()) as {rates?: Record<string, number>};
    if (!body.rates) throw new Error("FX response missing rates");

    const out: Record<string, number> = {};
    for (const code of requested) {
        const usdToForeign = body.rates[code];
        if (!usdToForeign || !(usdToForeign > 0)) throw new Error(`FX missing rate for ${code}`);
        out[code] = 1 / usdToForeign; // foreign -> USD
    }
    return out;
}
