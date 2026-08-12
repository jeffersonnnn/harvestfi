/// Converts a raw Trading Economics quote into the on-chain representation: USD scaled by 1e8,
/// per the commodity's unit. This is the single place the cents/pence/FX conversion happens.
/// See contracts/KEEPER.md for the rationale and the full currency table.

export const PRICE_DECIMALS = 8;
const SCALE = 1e8;

/// `fx` maps a currency code to its value in USD (e.g. { EUR: 1.09 } means 1 EUR = 1.09 USD).
/// Only consulted for non-USD/USd currencies.
export function normalizeToE8(raw: number, currency: string, fx: Record<string, number> = {}): bigint {
    if (!Number.isFinite(raw)) throw new Error(`non-finite raw price: ${raw}`);

    let usd: number;
    switch (currency) {
        case "USD":
            usd = raw;
            break;
        case "USd": // US cents
            usd = raw / 100;
            break;
        case "GBp": // British pence
            usd = (raw / 100) * fxRate(fx, "GBP");
            break;
        default:
            usd = raw * fxRate(fx, currency);
    }

    if (!(usd > 0)) throw new Error(`non-positive normalized price for ${raw} ${currency}`);

    // 1e8-scaled USD stays well within Number's safe-integer range for realistic prices.
    return BigInt(Math.round(usd * SCALE));
}

function fxRate(fx: Record<string, number>, code: string): number {
    const r = fx[code];
    if (!r || !(r > 0)) throw new Error(`missing/invalid FX rate for ${code}`);
    return r;
}
