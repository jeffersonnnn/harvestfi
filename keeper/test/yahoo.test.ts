import {test, afterEach} from "node:test";
import assert from "node:assert/strict";
import {yahooSource, _resetYahooSession} from "../src/sources.js";
import {COMMODITIES, COMMODITIES_BY_SYMBOL, type CommoditySpec} from "../src/commodities.js";
import {normalizeToE8} from "../src/normalize.js";

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
    _resetYahooSession(); // don't leak a cached session between tests
});

const spec = (symbol: string): CommoditySpec => {
    const c = COMMODITIES.find((x) => x.symbol === symbol);
    if (!c) throw new Error(`no such commodity ${symbol}`);
    return c;
};

// Serve the whole Yahoo handshake + chart flow. `chart(ticker)` decides each chart response so a test
// can inject a price, a "no data" (result:null), or an HTTP status. Session endpoints always succeed.
function yahooMock(chart: (ticker: string) => Response) {
    return (async (input: string) => {
        const url = String(input);
        if (url.includes("/v1/test/getcrumb")) return new Response("testcrumb123", {status: 200});
        if (!url.includes("/v8/finance/chart/")) {
            // fc.yahoo.com / finance.yahoo.com session seed → set an A1 cookie.
            return new Response("", {status: 200, headers: {"Set-Cookie": "A1=testcookie; Path=/; Domain=.yahoo.com"}});
        }
        return chart(decodeURIComponent(new URL(url).pathname.split("/").pop() ?? ""));
    }) as unknown as typeof fetch;
}

// Convenience: a chart responder driven by a {ticker -> price|null} map.
function priceChart(prices: Record<string, number | null>, timeSec?: number) {
    return (ticker: string) => {
        const px = prices[ticker];
        if (px == null) return new Response(JSON.stringify({chart: {result: null, error: {code: "Not Found"}}}), {status: 200});
        const meta = {currency: "USD", symbol: ticker, regularMarketPrice: px, regularMarketTime: timeSec ?? Math.floor(Date.now() / 1000)};
        return new Response(JSON.stringify({chart: {result: [{meta}], error: null}}), {status: 200});
    };
}

test("yahoo source maps regularMarketPrice by symbol", async () => {
    globalThis.fetch = yahooMock(priceChart({"ZC=F": 430.25, "GC=F": 4084.15}));
    const out = await yahooSource.fetchPrices([spec("CORN"), spec("GOLD")]);
    assert.equal(out.get("CORN"), 430.25);
    assert.equal(out.get("GOLD"), 4084.15);
});

test("yahoo grain prices normalize through the US-cents (USd) path — the corn trap holds", async () => {
    globalThis.fetch = yahooMock(priceChart({"ZC=F": 430.25}));
    const out = await yahooSource.fetchPrices([spec("CORN")]);
    // Corn quotes in US cents on Yahoo, exactly like TE. 430.25 cents = $4.3025/bu.
    assert.equal(COMMODITIES_BY_SYMBOL["CORN"].currency, "USd");
    assert.equal(normalizeToE8(out.get("CORN")!, "USd"), 430250000n);
});

test("yahoo source covers rice and cotton (which Pyth lacks entirely)", async () => {
    globalThis.fetch = yahooMock(priceChart({"ZR=F": 13.93, "CT=F": 82.365}));
    const out = await yahooSource.fetchPrices([spec("RICE"), spec("COTTON")]);
    assert.equal(out.get("RICE"), 13.93);
    assert.equal(out.get("COTTON"), 82.365);
});

test("yahoo source omits a symbol Yahoo returns no data for, keeps the rest", async () => {
    globalThis.fetch = yahooMock(priceChart({"ZW=F": 637.5, "ZS=F": null}));
    const out = await yahooSource.fetchPrices([spec("WHEAT"), spec("SOYBEANS")]);
    assert.equal(out.get("WHEAT"), 637.5);
    assert.equal(out.has("SOYBEANS"), false);
});

test("yahoo source drops a non-positive/garbage price", async () => {
    globalThis.fetch = yahooMock(priceChart({"KC=F": 0}));
    const out = await yahooSource.fetchPrices([spec("COFFEE")]);
    assert.equal(out.has("COFFEE"), false);
});

test("yahoo source survives one 429'd symbol without sinking the tick", async () => {
    globalThis.fetch = yahooMock((ticker) => {
        if (ticker === "SB=F") return new Response("Too Many Requests", {status: 429, statusText: "Too Many Requests"});
        const meta = {regularMarketPrice: 441.5, regularMarketTime: Math.floor(Date.now() / 1000)};
        return new Response(JSON.stringify({chart: {result: [{meta}], error: null}}), {status: 200});
    });
    const out = await yahooSource.fetchPrices([spec("CORN"), spec("SUGAR")]);
    assert.equal(out.get("CORN"), 441.5);
    assert.equal(out.has("SUGAR"), false); // the 429'd one is dropped, not fatal
});

test("yahoo source returns empty (not throw) when the session can't be established", async () => {
    // No cookie ever set (simulates a hard-blocked IP) → session setup fails → empty map, tick survives.
    globalThis.fetch = (async (input: string) => {
        if (String(input).includes("/v1/test/getcrumb")) return new Response("Too Many Requests", {status: 429});
        return new Response("", {status: 429}); // seed sets no cookie
    }) as unknown as typeof fetch;
    const out = await yahooSource.fetchPrices([spec("CORN"), spec("WHEAT")]);
    assert.equal(out.size, 0);
});
