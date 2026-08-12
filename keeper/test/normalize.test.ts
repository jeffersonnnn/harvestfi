import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeToE8} from "../src/normalize.js";
import {COMMODITIES_BY_SYMBOL} from "../src/commodities.js";

test("dollars pass through at 1e8", () => {
    assert.equal(normalizeToE8(4084.15, "USD"), 408415000000n);
    assert.equal(normalizeToE8(13.9296, "USD"), 1392960000n);
});

test("US cents (USd) are divided by 100 — the corn trap", () => {
    // Corn 441.7116 USd/Bu = $4.417116/Bu
    assert.equal(normalizeToE8(441.7116, "USd"), 441711600n);
    // Guard against the 100x mistake:
    assert.notEqual(normalizeToE8(441.7116, "USd"), normalizeToE8(441.7116, "USD"));
});

test("British pence (GBp) divide by 100 then apply GBP FX", () => {
    // 133.54 GBp * (GBP->USD 1.30) = $1.73602
    assert.equal(normalizeToE8(133.54, "GBp", {GBP: 1.3}), 173602000n);
});

test("generic FX currency multiplies foreign->USD", () => {
    assert.equal(normalizeToE8(100, "EUR", {EUR: 1.09}), 10900000000n);
});

test("missing FX rate throws", () => {
    assert.throws(() => normalizeToE8(100, "EUR", {}), /missing\/invalid FX/);
});

test("non-positive and non-finite raw throw", () => {
    assert.throws(() => normalizeToE8(0, "USD"), /non-positive/);
    assert.throws(() => normalizeToE8(NaN, "USD"), /non-finite/);
});

test("commodity map marks grains as cents and metals/rice as dollars", () => {
    assert.equal(COMMODITIES_BY_SYMBOL["CORN"].currency, "USd");
    assert.equal(COMMODITIES_BY_SYMBOL["WHEAT"].currency, "USd");
    assert.equal(COMMODITIES_BY_SYMBOL["GOLD"].currency, "USD");
    assert.equal(COMMODITIES_BY_SYMBOL["RICE"].currency, "USD");
});
