import {test, afterEach} from "node:test";
import assert from "node:assert/strict";
import {pythLegToNumber, pythSource} from "../src/sources.js";
import {COMMODITIES, type CommoditySpec} from "../src/commodities.js";

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

const spec = (symbol: string): CommoditySpec => {
    const c = COMMODITIES.find((x) => x.symbol === symbol);
    if (!c) throw new Error(`no such commodity ${symbol}`);
    return c;
};

test("pythLegToNumber applies the decimal exponent", () => {
    // GOLD 4084.15 as Pyth mantissa+expo
    assert.equal(pythLegToNumber({price: "408415000000", conf: "0", expo: -8, publish_time: 0}), 4084.15);
    // Different expo, same value
    assert.equal(pythLegToNumber({price: "408415", conf: "0", expo: -2, publish_time: 0}), 4084.15);
});

// Minimal Hermes /v2/updates/price/latest?parsed=true response shape.
function hermesBody(feeds: Array<{id: string; price: string; expo: number; publish_time: number}>) {
    return {
        parsed: feeds.map((f) => ({
            id: f.id, // Hermes returns ids WITHOUT the 0x prefix, lowercased
            price: {price: f.price, conf: "1", expo: f.expo, publish_time: f.publish_time},
        })),
    };
}

const GOLD_FEED = "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2";
const SILVER_FEED = "f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e";

test("pyth source returns fresh USD spot prices keyed by symbol", async () => {
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = (async () =>
        new Response(
            JSON.stringify(
                hermesBody([
                    {id: GOLD_FEED, price: "408415000000", expo: -8, publish_time: now},
                    {id: SILVER_FEED, price: "5970400000", expo: -8, publish_time: now},
                ]),
            ),
            {status: 200},
        )) as unknown as typeof fetch;

    const out = await pythSource.fetchPrices([spec("GOLD"), spec("SILVER")]);
    assert.equal(out.get("GOLD"), 4084.15);
    assert.equal(out.get("SILVER"), 59.704);
});

test("pyth source drops a stale feed (closed market) but keeps the fresh one", async () => {
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = (async () =>
        new Response(
            JSON.stringify(
                hermesBody([
                    {id: GOLD_FEED, price: "408415000000", expo: -8, publish_time: now},
                    {id: SILVER_FEED, price: "5970400000", expo: -8, publish_time: now - 4000}, // >300s old
                ]),
            ),
            {status: 200},
        )) as unknown as typeof fetch;

    const out = await pythSource.fetchPrices([spec("GOLD"), spec("SILVER")]);
    assert.equal(out.get("GOLD"), 4084.15);
    assert.equal(out.has("SILVER"), false);
});

test("pyth source omits commodities that have no clean-spot feed (grains)", async () => {
    let called = false;
    globalThis.fetch = (async () => {
        called = true;
        return new Response(JSON.stringify(hermesBody([])), {status: 200});
    }) as unknown as typeof fetch;

    // CORN has no Pyth spot feed → filtered out before any network call happens.
    const out = await pythSource.fetchPrices([spec("CORN")]);
    assert.equal(out.size, 0);
    assert.equal(called, false);
});

test("pyth source throws on a non-OK Hermes response", async () => {
    globalThis.fetch = (async () => new Response("upstream boom", {status: 503, statusText: "Service Unavailable"})) as unknown as typeof fetch;
    await assert.rejects(() => pythSource.fetchPrices([spec("GOLD")]), /Pyth Hermes fetch failed: 503/);
});
