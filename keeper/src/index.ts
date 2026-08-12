import {type Address, type Hex} from "viem";
import {config} from "./config.js";
import {account, publicClient, walletClient} from "./client.js";
import {pushPriceOracleAbi} from "./abis.js";
import {COMMODITIES} from "./commodities.js";
import {normalizeToE8} from "./normalize.js";
import {fetchFxRates} from "./fx.js";
import {selectSource} from "./sources.js";
import {signPrice} from "./sign.js";

interface Update {
    id: bigint;
    symbol: string;
    priceE8: bigint;
    ts: bigint;
}

/// Build the normalized, timestamped price updates for this tick.
async function buildUpdates(nowSec: bigint): Promise<Update[]> {
    const source = selectSource();
    const raw = await source.fetchPrices(COMMODITIES);

    const currencies = COMMODITIES.map((c) => c.currency);
    const fx = await fetchFxRates(currencies);

    const updates: Update[] = [];
    for (const c of COMMODITIES) {
        const r = raw.get(c.symbol);
        if (r === undefined) {
            console.warn(`[keeper] no quote for ${c.symbol} (id ${c.id}) — skipping`);
            continue;
        }
        try {
            updates.push({id: c.id, symbol: c.symbol, priceE8: normalizeToE8(r, c.currency, fx), ts: nowSec});
        } catch (e) {
            console.warn(`[keeper] normalize failed for ${c.symbol}: ${(e as Error).message}`);
        }
    }
    return updates;
}

async function tick() {
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const updates = await buildUpdates(nowSec);
    if (updates.length === 0) {
        console.log("[keeper] nothing to post");
        return;
    }

    if (config.dryRun) {
        console.log(`[keeper] DRY_RUN — would post ${updates.length} price(s) at ts=${nowSec}:`);
        for (const u of updates) {
            console.log(`  id ${u.id} ${u.symbol.padEnd(12)} ${u.priceE8.toString()} (1e8 USD)`);
        }
        return;
    }

    // Live: drop any commodity whose on-chain timestamp is already >= now (contract requires
    // strictly increasing, non-future timestamps).
    const ids: bigint[] = [];
    const prices: bigint[] = [];
    const timestamps: bigint[] = [];
    const signatures: Hex[] = [];

    for (const u of updates) {
        const [, onchainTs] = (await publicClient.readContract({
            address: config.oracleAddress,
            abi: pushPriceOracleAbi,
            functionName: "getPrice",
            args: [u.id],
        })) as readonly [bigint, bigint];

        if (u.ts <= onchainTs) {
            console.log(`[keeper] ${u.symbol}: ts ${u.ts} not ahead of on-chain ${onchainTs} — skipping`);
            continue;
        }

        const sig = await signPrice(account, config.chainId, config.oracleAddress, u.id, u.priceE8, u.ts);
        ids.push(u.id);
        prices.push(u.priceE8);
        timestamps.push(u.ts);
        signatures.push(sig);
    }

    if (ids.length === 0) {
        console.log("[keeper] nothing fresh to post this tick");
        return;
    }

    const hash = await walletClient.writeContract({
        address: config.oracleAddress,
        abi: pushPriceOracleAbi,
        functionName: "postPrices",
        args: [ids, prices, timestamps, signatures],
    });
    console.log(`[keeper] posted ${ids.length} price(s): ${hash}`);
}

async function main() {
    console.log(`[keeper] RWA perps price keeper`);
    console.log(`[keeper] source=${config.priceSource} chainId=${config.chainId} dryRun=${config.dryRun}`);
    console.log(`[keeper] oracle=${config.oracleAddress} signer=${account.address}`);

    if (!config.dryRun) {
        const trusted = (await publicClient.readContract({
            address: config.oracleAddress,
            abi: pushPriceOracleAbi,
            functionName: "trustedSigner",
        })) as Address;
        if (trusted.toLowerCase() !== account.address.toLowerCase()) {
            throw new Error(`signer ${account.address} != oracle.trustedSigner ${trusted}`);
        }
    }

    await tick();
    setInterval(() => {
        tick().catch((e) => console.error("[keeper] tick error:", (e as Error).message.slice(0, 200)));
    }, config.postIntervalMs);
}

main().catch((e) => {
    console.error("[keeper] fatal:", e);
    process.exit(1);
});
