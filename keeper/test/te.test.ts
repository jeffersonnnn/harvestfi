import "./env-setup.js"; // MUST be first: sets TE_API_KEY before config.ts reads it at import time
import {test, afterEach} from "node:test";
import assert from "node:assert/strict";
import {tradingEconomicsSource} from "../src/sources.js";
import {COMMODITIES, type CommoditySpec} from "../src/commodities.js";
import {normalizeToE8} from "../src/normalize.js";

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

const spec = (symbol: string): CommoditySpec => {
    const c = COMMODITIES.find((x) => x.symbol === symbol);
    if (!c) throw new Error(`no such commodity ${symbol}`);
    return c;
};

// Minimal TE /markets/commodities row shape (only the fields the adapter reads).
function teRow(slug: string, last: number, unit: string) {
    return {Name: slug, Last: last, unit, URL: `/commodity/${slug}`};
}

function teMock(rows: object[]) {
    return (async () => new Response(JSON.stringify(rows), {status: 200})) as unknown as typeof fetch;
}

test("TE source matches on the /commodity/<slug> URL and returns Last", async () => {
    globalThis.fetch = teMock([
        teRow("gold", 4405.93, "USD/t.oz"),
        teRow("corn", 439.8462, "USd/BU"),
    ]);
    const out = await tradingEconomicsSource.fetchPrices([spec("GOLD"), spec("CORN")]);
    assert.equal(out.get("GOLD"), 4405.93);
    assert.equal(out.get("CORN"), 439.8462);
});

test("TE grain price normalizes through the US-cents path", async () => {
    globalThis.fetch = teMock([teRow("corn", 439.8462, "USd/BU")]);
    const out = await tradingEconomicsSource.fetchPrices([spec("CORN")]);
    // 439.8462 cents = $4.398462/bu
    assert.equal(normalizeToE8(out.get("CORN")!, "USd"), 439846200n);
});

test("TE source does not mis-match similar names (soybeans ≠ soybean oil)", async () => {
    // A fuzzy substring match would wrongly pick 'soybean-oil' for 'soybeans'; slug match must not.
    globalThis.fetch = teMock([
        teRow("soybean-oil", 55.1, "USd/Lbs"),
        teRow("soybeans", 1146.82, "USd/Bu"),
    ]);
    const out = await tradingEconomicsSource.fetchPrices([spec("SOYBEANS")]);
    assert.equal(out.get("SOYBEANS"), 1146.82);
});

test("TE source omits a commodity absent from the response", async () => {
    globalThis.fetch = teMock([teRow("gold", 4405.93, "USD/t.oz")]);
    const out = await tradingEconomicsSource.fetchPrices([spec("GOLD"), spec("RICE")]);
    assert.equal(out.get("GOLD"), 4405.93);
    assert.equal(out.has("RICE"), false);
});

test("TE source drops a non-positive Last", async () => {
    globalThis.fetch = teMock([teRow("wheat", 0, "USd/Bu")]);
    const out = await tradingEconomicsSource.fetchPrices([spec("WHEAT")]);
    assert.equal(out.has("WHEAT"), false);
});

test("TE source throws on a non-OK response", async () => {
    globalThis.fetch = (async () =>
        new Response("nope", {status: 401, statusText: "Unauthorized"})) as unknown as typeof fetch;
    await assert.rejects(() => tradingEconomicsSource.fetchPrices([spec("GOLD")]), /TE fetch failed: 401/);
});
