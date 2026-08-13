import {config} from "./config.js";
import {type CommoditySpec} from "./commodities.js";

/// A price source returns RAW Trading Economics quote numbers keyed by symbol, in the commodity's
/// native currency/unit (e.g. CORN -> 441.71 in US cents). Normalization happens downstream.
export interface PriceSource {
    readonly name: string;
    fetchPrices(specs: CommoditySpec[]): Promise<Map<string, number>>;
}

/// Last-observed quotes from tradingeconomics.com/commodities (verified 2026-08). For dev / dry-run
/// so the full normalize->sign->post pipeline is runnable and testable without a data subscription.
const STATIC_QUOTES: Record<string, number> = {
    GOLD: 4084.15,
    SILVER: 59.704,
    COPPER: 6.6183,
    PLATINUM: 1753.1,
    CRUDE_OIL: 75.697,
    NATURAL_GAS: 2.6795,
    CORN: 441.7116, // US cents
    WHEAT: 637.57, // US cents
    RICE: 13.9296, // dollars
    SOYBEANS: 1152.54, // US cents
    COFFEE: 323.05, // US cents
    SUGAR: 15.06, // US cents
    COTTON: 82.365, // US cents
};

export const staticSource: PriceSource = {
    name: "static",
    async fetchPrices(specs) {
        const out = new Map<string, number>();
        for (const s of specs) {
            const v = STATIC_QUOTES[s.symbol];
            if (v !== undefined) out.set(s.symbol, v);
        }
        return out;
    },
};

/// SIMULATED price feed - a synthetic, continuous market model for all 23 markets. This is NOT real
/// market data; the UI must disclose "simulated prices" to users (NEXT_PUBLIC_SIMULATED_PRICES).
///
/// Model: each price is a pure, deterministic function of the wall clock - a fractal value-noise
/// curve (sum of octaves at day/hour/15m/3m scales) that mean-reverts around a realistic per-commodity
/// anchor and is scaled by a realistic per-commodity volatility band. Because it depends only on the
/// clock (no stored state), it is CONTINUOUS across stateless Worker restarts and reproducible: two
/// ticks a minute apart read nearly-equal prices, so opens and closes settle on the same series (no
/// phantom PnL). Anchors are in each commodity's NATIVE quote currency (matching commodities.ts), so
/// the existing cents/dollars + FX normalize step applies unchanged.
interface SimSpec {
    price: number; // anchor in NATIVE currency (USd cents / USD / EUR / CAD / INR / MYR / AUD)
    vol: number; // fractional band half-width (e.g. 0.06 => wanders within ~±6% of the anchor)
}
const SIM: Record<string, SimSpec> = {
    CORN: {price: 441.71, vol: 0.05}, WHEAT: {price: 637.57, vol: 0.06}, RICE: {price: 13.93, vol: 0.05},
    SOYBEANS: {price: 1152.54, vol: 0.05}, COFFEE: {price: 323.05, vol: 0.1}, SUGAR: {price: 15.06, vol: 0.08},
    COTTON: {price: 82.37, vol: 0.06}, OAT: {price: 385, vol: 0.06}, ORANGE_JUICE: {price: 310, vol: 0.1},
    CHEESE: {price: 1.85, vol: 0.05}, COCOA: {price: 8200, vol: 0.12}, LUMBER: {price: 600, vol: 0.08},
    MILK: {price: 19.5, vol: 0.06}, RUBBER: {price: 170, vol: 0.07}, BUTTER: {price: 7000, vol: 0.05},
    POTATOES: {price: 18, vol: 0.15}, RAPESEED: {price: 950, vol: 0.06}, CANOLA: {price: 650, vol: 0.06},
    BARLEY: {price: 18000, vol: 0.05}, SUNFLOWER_OIL: {price: 1200, vol: 0.06}, TEA: {price: 200, vol: 0.05},
    PALM_OIL: {price: 4000, vol: 0.07}, WOOL: {price: 1800, vol: 0.06},
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
    return v - Math.floor(v); // [0,1)
};
// Smooth (C1) value noise in [-1,1]: interpolate integer samples with a smoothstep - continuous in t.
function vnoise(seed: number, t: number, period: number): number {
    const x = t / period + seed;
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = hash01(i);
    const b = hash01(i + 1);
    return (a + (b - a) * u) * 2 - 1;
}
// Fractal sum of octaves (weights sum to 1): a slow multi-day trend plus intraday/short-term chop.
function fbm(seed: number, t: number): number {
    return (
        0.45 * vnoise(seed, t, 172800) + // ~2-day trend
        0.3 * vnoise(seed + 11, t, 7200) + // ~2h swing
        0.15 * vnoise(seed + 23, t, 900) + // ~15m
        0.1 * vnoise(seed + 41, t, 180) // ~3m chop
    );
}
export const simulatedSource: PriceSource = {
    name: "simulated",
    async fetchPrices(specs) {
        const t = Date.now() / 1000;
        const out = new Map<string, number>();
        for (const s of specs) {
            const cfg = SIM[s.symbol];
            if (cfg === undefined) continue;
            const move = fbm(simSeed(s.symbol), t) * cfg.vol;
            out.set(s.symbol, cfg.price * (1 + move));
        }
        return out;
    },
};

/// Trading Economics official API adapter (the chosen production source - serves all 13 commodities
/// incl. a continuous front-month grain series, which the free feeds do not). Requires TE_API_KEY.
///
/// Verified live (2026-08): `/markets/commodities` returns one row per commodity carrying a stable
/// `URL` of the form `/commodity/<slug>` that maps 1:1 to our `teSlug` (all 13 resolve), a `Last`
/// price, and a `unit` ("USD/Bbl", "USd/Bu", …) whose USd-prefix == US cents, matching the currency in
/// commodities.ts. So we match on the URL slug (exact - far more robust than a name substring) and
/// return `Last`; the existing normalize step applies the cents/dollars split. A `USd/...` unit that
/// disagrees with our recorded currency is warned about (a guard against TE changing a quote unit).
export const tradingEconomicsSource: PriceSource = {
    name: "tradingeconomics",
    async fetchPrices(specs) {
        if (!config.teApiKey) {
            throw new Error("PRICE_SOURCE=tradingeconomics requires TE_API_KEY (see .env.example)");
        }
        const url = `https://api.tradingeconomics.com/markets/commodities?c=${config.teApiKey}&f=json`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`TE fetch failed: ${res.status} ${res.statusText}`);
        const rows = (await res.json()) as Array<Record<string, unknown>>;

        // Index rows by their /commodity/<slug> URL - an exact, stable key that matches our teSlug.
        const bySlug = new Map<string, Record<string, unknown>>();
        for (const row of rows) {
            const m = /\/commodity\/([a-z0-9-]+)/.exec(String(row["URL"] ?? ""));
            if (m) bySlug.set(m[1], row);
        }

        const out = new Map<string, number>();
        for (const s of specs) {
            const row = bySlug.get(s.teSlug);
            if (!row) {
                console.warn(`[keeper] TE: no row for ${s.symbol} (slug ${s.teSlug})`);
                continue;
            }
            const last = Number(row["Last"]);
            if (!Number.isFinite(last) || last <= 0) {
                console.warn(`[keeper] TE: bad Last for ${s.symbol}: ${row["Last"]}`);
                continue;
            }
            // Defensive unit check: TE writes US cents as "USd/..." OR "USD Cents / ..." (e.g. rubber);
            // either must agree with our recorded currency.
            const teUnit = String(row["unit"] ?? "");
            const teIsCents = teUnit.startsWith("USd") || /cents/i.test(teUnit);
            if (teIsCents !== (s.currency === "USd")) {
                console.warn(
                    `[keeper] TE: unit "${teUnit}" disagrees with ${s.symbol} currency=${s.currency} - check commodities.ts`,
                );
            }
            out.set(s.symbol, last);
        }
        return out;
    },
};

/// Pyth Network clean-SPOT feed IDs (verified LIVE against Hermes, 2026-08). These are the only
/// commodities Pyth actually publishes as a genuine, continuous spot price. ⚠️ Grains/softs/natgas are
/// NOT here for a hard reason discovered by probing: their Pyth futures feeds (COU6, WHZ6, SOU6, CFU6,
/// RSV6, NGDU6, …) all exist in the catalog but return price:0 / publish_time:0 - DEAD, publishing
/// nothing. Of all 126 Pyth "Commodities" feeds only 5 are live, all oil (WTI/Brent spot + WTI dated
/// futures). So there is nothing to build a roll layer on; grains come from the `yahoo` source instead.
/// COPPER's XCU/USD is also dead (price 0) - kept here but the guard skips it. Rice/cotton have no Pyth
/// feed at all. ⚠️ CRUDE_OIL uses USOILSPOT (WTI) - NOT XTI, which is Titanium. See CLAUDE.md.
const PYTH_SPOT_FEED_IDS: Record<string, string> = {
    GOLD: "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2", // XAU/USD
    SILVER: "f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e", // XAG/USD
    COPPER: "636bedafa14a37912993f265eda22431a2be363ad41a10276424bbe1b7f508c4", // XCU/USD
    PLATINUM: "398e4bbc7cbf89d6648c21e08019d878967677753b3096799595c78f805a34e5", // XPT/USD
    CRUDE_OIL: "925ca92ff005ae943c158e3563f59698ce7e75c5a8c8dd43303a0a154887b3e6", // USOILSPOT/USD (WTI)
};

interface PythPriceLeg {
    price: string; // integer mantissa as a string
    conf: string;
    expo: number; // decimal exponent: value = Number(price) * 10 ** expo
    publish_time: number; // unix seconds
}
interface PythParsedFeed {
    id: string; // 32-byte feed id, hex, no 0x prefix, lowercased
    price: PythPriceLeg;
    ema_price?: PythPriceLeg;
}
interface PythLatestResponse {
    parsed?: PythParsedFeed[];
}

const stripHex = (id: string) => id.toLowerCase().replace(/^0x/, "");

/// Convert a Pyth price leg to a plain number in its quote unit (USD here): mantissa * 10^expo.
/// Exported for testing.
export function pythLegToNumber(leg: PythPriceLeg): number {
    return Number(leg.price) * 10 ** leg.expo;
}

/// Pyth Network adapter (free public Hermes API - no key; redistribution-clean). Fetches the latest
/// spot price for every requested commodity that has a clean-spot feed, converts mantissa*10^expo to
/// a USD number, and drops feeds that are stale (see PYTH_MAX_STALE_SEC). Returns USD directly, so the
/// commodity's `currency: "USD"` flows through normalizeToE8 untouched. Commodities without a spot feed
/// are simply omitted (the caller warns + skips them). See CLAUDE.md "Data-source decision".
export const pythSource: PriceSource = {
    name: "pyth",
    async fetchPrices(specs) {
        const wanted = specs.filter((s) => PYTH_SPOT_FEED_IDS[s.symbol]);
        const out = new Map<string, number>();
        if (wanted.length === 0) return out;

        const query = wanted.map((s) => `ids[]=${PYTH_SPOT_FEED_IDS[s.symbol]}`).join("&");
        const url = `${config.pythHermesUrl}/v2/updates/price/latest?${query}&parsed=true`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Pyth Hermes fetch failed: ${res.status} ${res.statusText}`);
        const body = (await res.json()) as PythLatestResponse;

        // Index returned feeds by normalized id (Hermes returns ids without the 0x prefix).
        const byId = new Map<string, PythParsedFeed>();
        for (const f of body.parsed ?? []) byId.set(stripHex(f.id), f);

        const nowSec = Math.floor(Date.now() / 1000);
        for (const s of wanted) {
            const f = byId.get(stripHex(PYTH_SPOT_FEED_IDS[s.symbol]));
            if (!f) {
                console.warn(`[keeper] pyth: no feed returned for ${s.symbol}`);
                continue;
            }
            const ageSec = nowSec - f.price.publish_time;
            if (config.pythMaxStaleSec > 0 && ageSec > config.pythMaxStaleSec) {
                console.warn(`[keeper] pyth: ${s.symbol} stale (${ageSec}s old) - skipping, market likely closed`);
                continue;
            }
            const value = pythLegToNumber(f.price);
            if (!Number.isFinite(value) || value <= 0) {
                console.warn(`[keeper] pyth: bad price for ${s.symbol}: ${JSON.stringify(f.price)}`);
                continue;
            }
            out.set(s.symbol, value);
        }
        return out;
    },
};

/// Yahoo Finance continuous front-month futures (`ROOT=F`). Yahoo already stitches each `=F` symbol
/// into a continuous, back-adjusted series, so NO roll adapter is needed. Covers the whole registry -
/// crucially the grains/softs Pyth can't (corn/wheat/soybeans/coffee/sugar/natgas) PLUS rice & cotton,
/// which have no Pyth feed at all, and copper (HG=F) whose Pyth feed is dead.
///
/// Units follow the same convention Trading Economics uses (and commodities.ts already encodes): grains
/// & softs quote in US CENTS (currency "USd" → normalizeToE8 divides by 100), metals/energy/rice in
/// dollars. So this source returns Yahoo's raw `regularMarketPrice` and the existing normalize step
/// handles the cents/dollars split - the same field mapping metals+grains already rely on.
///
/// ⚠️ Unofficial API. Yahoo now rejects sessionless requests with a misleading 429 ("Too Many
/// Requests" really means "no valid session"), so we do the standard handshake: grab an A1 cookie from
/// fc.yahoo.com, exchange it for a crumb at /v1/test/getcrumb, then send both on every chart call and
/// rebuild the session if it goes stale. Yahoo ALSO hard-blocks datacenter IP ranges (no cookie ever
/// set) - that can't be worked around; run the keeper from a normal residential/host IP. Treat this
/// source as testnet/demo-grade, not mainnet-grade.
const YAHOO_SYMBOLS: Record<string, string> = {
    GOLD: "GC=F",
    SILVER: "SI=F",
    COPPER: "HG=F",
    PLATINUM: "PL=F",
    CRUDE_OIL: "CL=F",
    NATURAL_GAS: "NG=F",
    CORN: "ZC=F",
    WHEAT: "ZW=F",
    RICE: "ZR=F",
    SOYBEANS: "ZS=F",
    COFFEE: "KC=F",
    SUGAR: "SB=F",
    COTTON: "CT=F",
};

// A browser-like UA is required or Yahoo returns 429 even from an un-blocked IP.
const YAHOO_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface YahooMeta {
    currency?: string;
    symbol?: string;
    regularMarketPrice?: number;
    regularMarketTime?: number; // unix seconds
}
interface YahooChartResponse {
    chart?: {result?: Array<{meta?: YahooMeta}> | null; error?: unknown};
}

interface YahooSession {
    cookie: string;
    crumb: string;
}

// Cached across ticks; invalidated (set null) when a request 401/429s so the next tick rebuilds it.
let yahooSession: YahooSession | null = null;

/// Test-only: clear the cached Yahoo session so each test establishes a fresh one.
export function _resetYahooSession(): void {
    yahooSession = null;
}

function cookiesFromResponse(res: Response): string {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const single = res.headers.get("set-cookie");
    const all = list.length ? list : single ? [single] : [];
    return all
        .map((c) => c.split(";")[0])
        .filter(Boolean)
        .join("; ");
}

async function establishYahooSession(): Promise<YahooSession> {
    // A1 session cookie: fc.yahoo.com 404s but still sets it; fall back to the finance host.
    let cookie = "";
    for (const seed of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
        const r = await fetch(seed, {headers: {"User-Agent": YAHOO_UA}});
        cookie = cookiesFromResponse(r);
        if (cookie) break;
    }
    if (!cookie) throw new Error("could not obtain a session cookie (IP is likely hard-blocked by Yahoo)");
    const r = await fetch(`${config.yahooBaseUrl}/v1/test/getcrumb`, {
        headers: {"User-Agent": YAHOO_UA, Cookie: cookie},
    });
    const crumb = (await r.text()).trim();
    if (!r.ok || !crumb || /[\s<>]/.test(crumb)) {
        throw new Error(`could not obtain a crumb (got "${crumb.slice(0, 40)}")`);
    }
    return {cookie, crumb};
}

async function fetchYahooQuote(ticker: string, session: YahooSession): Promise<YahooMeta | null> {
    const url =
        `${config.yahooBaseUrl}/v8/finance/chart/${encodeURIComponent(ticker)}` +
        `?interval=1d&range=1d&crumb=${encodeURIComponent(session.crumb)}`;
    const res = await fetch(url, {
        headers: {"User-Agent": YAHOO_UA, Accept: "application/json", Cookie: session.cookie},
    });
    if (res.status === 401 || res.status === 429) {
        yahooSession = null; // stale/blocked - force a rebuild on the next tick
        throw new Error(`Yahoo ${res.status} for ${ticker} (session invalidated, retrying next tick)`);
    }
    if (!res.ok) throw new Error(`Yahoo fetch failed for ${ticker}: ${res.status} ${res.statusText}`);
    const body = (await res.json()) as YahooChartResponse;
    return body.chart?.result?.[0]?.meta ?? null;
}

export const yahooSource: PriceSource = {
    name: "yahoo",
    async fetchPrices(specs) {
        const wanted = specs.filter((s) => YAHOO_SYMBOLS[s.symbol]);
        const out = new Map<string, number>();
        const nowSec = Math.floor(Date.now() / 1000);
        if (wanted.length === 0) return out;

        // Establish the cookie+crumb session ONCE per tick (reused if already cached), then fan out.
        let session: YahooSession;
        try {
            session = yahooSession ?? (yahooSession = await establishYahooSession());
        } catch (e) {
            console.warn(`[keeper] yahoo: session setup failed - ${(e as Error).message}`);
            return out;
        }

        // One request per symbol (the chart endpoint is single-symbol); fetch in parallel and let one
        // bad symbol fail without sinking the whole tick.
        const results = await Promise.allSettled(
            wanted.map(async (s) => ({s, meta: await fetchYahooQuote(YAHOO_SYMBOLS[s.symbol], session)})),
        );

        for (const r of results) {
            if (r.status === "rejected") {
                console.warn(`[keeper] yahoo: ${(r.reason as Error).message}`);
                continue;
            }
            const {s, meta} = r.value;
            const price = meta?.regularMarketPrice;
            if (meta == null || typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
                console.warn(`[keeper] yahoo: no valid price for ${s.symbol} (${YAHOO_SYMBOLS[s.symbol]})`);
                continue;
            }
            if (
                config.yahooMaxStaleSec > 0 &&
                meta.regularMarketTime &&
                nowSec - meta.regularMarketTime > config.yahooMaxStaleSec
            ) {
                const age = nowSec - meta.regularMarketTime;
                console.warn(`[keeper] yahoo: ${s.symbol} stale (${age}s) - skipping, market likely closed`);
                continue;
            }
            out.set(s.symbol, price);
        }
        return out;
    },
};

export function selectSource(): PriceSource {
    switch (config.priceSource) {
        case "static":
            return staticSource;
        case "simulated":
            return simulatedSource;
        case "tradingeconomics":
            return tradingEconomicsSource;
        case "pyth":
            return pythSource;
        case "yahoo":
            return yahooSource;
        default:
            throw new Error(`Unknown PRICE_SOURCE: ${config.priceSource}`);
    }
}
