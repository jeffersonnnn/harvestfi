import {test} from "node:test";
import assert from "node:assert/strict";
import {INDEXES, INDEXES_BY_SYMBOL, INDEX_SYMBOLS, deriveIndexE8} from "../src/indexes.js";
import {COMMODITIES_BY_SYMBOL} from "../src/commodities.js";

const E8 = 100_000_000n;

test("an index at its reference anchors prices exactly 100.00", () => {
    const def = INDEXES_BY_SYMBOL["ENERGY_INDEX"];
    // Every constituent sitting on its base => each ratio is 1 => index = 100.
    const leaves = new Map(def.constituents.map((c) => [c.symbol, BigInt(Math.round(c.base * 1e8))]));
    assert.equal(deriveIndexE8(def, leaves), 100n * E8);
});

test("a uniform +10% basket lifts the index to 110.00", () => {
    const def = INDEXES_BY_SYMBOL["METALS_INDEX"];
    const leaves = new Map(def.constituents.map((c) => [c.symbol, BigInt(Math.round(c.base * 1.1 * 1e8))]));
    // Allow 1 unit of rounding slack across the basket.
    const got = deriveIndexE8(def, leaves)!;
    assert.ok(got >= 110n * E8 - 5n && got <= 110n * E8 + 5n, `got ${got}`);
});

test("missing constituents are skipped; the rest still average", () => {
    const def = INDEXES_BY_SYMBOL["GRAIN_INDEX"];
    // Only 3 of 6 present, all at +20% => index should be 120.
    const present = def.constituents.slice(0, 3);
    const leaves = new Map(present.map((c) => [c.symbol, BigInt(Math.round(c.base * 1.2 * 1e8))]));
    const got = deriveIndexE8(def, leaves)!;
    assert.ok(got >= 120n * E8 - 5n && got <= 120n * E8 + 5n, `got ${got}`);
});

test("too few constituents (fewer than half) returns null", () => {
    const def = INDEXES_BY_SYMBOL["GRAIN_INDEX"]; // 6 constituents => need >= 3
    const one = def.constituents[0];
    const leaves = new Map([[one.symbol, BigInt(Math.round(one.base * 1e8))]]);
    assert.equal(deriveIndexE8(def, leaves), null);
});

test("empty leaves returns null (no phantom price)", () => {
    assert.equal(deriveIndexE8(INDEXES_BY_SYMBOL["ENERGY_INDEX"], new Map()), null);
});

test("every index constituent is a real catalog symbol", () => {
    for (const def of INDEXES) {
        for (const c of def.constituents) {
            assert.ok(COMMODITIES_BY_SYMBOL[c.symbol], `${def.symbol} constituent ${c.symbol} not in catalog`);
        }
    }
});

test("every index symbol is itself a synthetic catalog row", () => {
    for (const sym of INDEX_SYMBOLS) {
        const row = COMMODITIES_BY_SYMBOL[sym];
        assert.ok(row, `${sym} missing from catalog`);
        assert.equal(row.synthetic, true, `${sym} must be marked synthetic`);
    }
});

test("index bases match the constituent SIM anchors (index rests at 100)", () => {
    // The base MUST equal the leaf's normalized rest value or the index would not sit at 100.
    // This guards against a base drifting away from sources.ts after an anchor edit.
    const expected: Record<string, number> = {
        CRUDE_OIL: 78, BRENT_CRUDE: 82, NATURAL_GAS: 2.9, GASOLINE: 2.35, HEATING_OIL: 2.5,
        COPPER: 9200, ALUMINUM: 2400, ZINC: 2700, NICKEL: 16500, PALLADIUM: 1000,
        CORN: 4.4171, WHEAT: 6.3757, SOYBEANS: 11.5254, SUGAR: 0.1506, COFFEE: 3.2305, COTTON: 0.8237,
    };
    for (const def of INDEXES) {
        for (const c of def.constituents) {
            assert.equal(c.base, expected[c.symbol], `${c.symbol} base drifted`);
        }
    }
});
