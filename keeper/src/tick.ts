import {type Address, type Hex} from "viem";
import {config} from "./config.js";
import {account, publicClient, walletClient} from "./client.js";
import {pushPriceOracleAbi} from "./abis.js";
import {normalizeToE8} from "./normalize.js";
import {fetchFxRates} from "./fx.js";
import {selectSource} from "./sources.js";
import {signPrice} from "./sign.js";
import {discoverMarkets} from "./markets.js";
import {INDEXES_BY_SYMBOL, deriveIndexE8} from "./indexes.js";

/// The keeper's core work, factored out so BOTH the Node long-running loop (index.ts) and the
/// Cloudflare Worker (worker/worker.ts, one tick per cron fire) call the same code path.

interface Update {
    id: bigint;
    symbol: string;
    priceE8: bigint;
    ts: bigint;
}

/// Build the normalized, timestamped price updates for this tick.
async function buildUpdates(nowSec: bigint): Promise<Update[]> {
    const source = selectSource();
    // Discover the active market set from the registry each tick, so markets added on-chain are
    // picked up automatically (no restart, no code change). Falls back to the static catalog offline.
    const markets = await discoverMarkets(config.registryAddress);
    // Synthetic index markets are NOT fetched: they are derived from the leaf prices below. Fetch only
    // the real leaves so the source never sees an index symbol it cannot price.
    const leaves = markets.filter((c) => !c.synthetic);
    const indexMarkets = markets.filter((c) => c.synthetic);
    const raw = await source.fetchPrices(leaves);

    const currencies = leaves.map((c) => c.currency);
    const fx = await fetchFxRates(currencies);

    const updates: Update[] = [];
    const leafE8 = new Map<string, bigint>(); // symbol -> normalized 1e8 price, for index derivation
    for (const c of leaves) {
        const r = raw.get(c.symbol);
        if (r === undefined) {
            console.warn(`[keeper] no quote for ${c.symbol} (id ${c.id}) - skipping`);
            continue;
        }
        try {
            const priceE8 = normalizeToE8(r, c.currency, fx);
            updates.push({id: c.id, symbol: c.symbol, priceE8, ts: nowSec});
            leafE8.set(c.symbol, priceE8);
        } catch (e) {
            console.warn(`[keeper] normalize failed for ${c.symbol}: ${(e as Error).message}`);
        }
    }

    // Derive each synthetic index from this tick's leaf prices and post it like any other market.
    for (const c of indexMarkets) {
        const def = INDEXES_BY_SYMBOL[c.symbol];
        if (!def) {
            console.warn(`[keeper] synthetic market ${c.symbol} (id ${c.id}) has no index def - skipping`);
            continue;
        }
        const priceE8 = deriveIndexE8(def, leafE8);
        if (priceE8 === null) {
            console.warn(`[keeper] index ${c.symbol} (id ${c.id}) - too few constituents priced, skipping`);
            continue;
        }
        updates.push({id: c.id, symbol: c.symbol, priceE8, ts: nowSec});
    }
    return updates;
}

/// Guard: refuse to post live unless our account is the oracle's trusted signer.
export async function assertTrustedSigner(): Promise<void> {
    const trusted = (await publicClient.readContract({
        address: config.oracleAddress,
        abi: pushPriceOracleAbi,
        functionName: "trustedSigner",
    })) as Address;
    if (trusted.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error(`signer ${account.address} != oracle.trustedSigner ${trusted}`);
    }
}

/// Run a single tick: fetch → normalize → (dry-run print | sign + post).
export async function runOnce(): Promise<void> {
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const updates = await buildUpdates(nowSec);
    if (updates.length === 0) {
        console.log("[keeper] nothing to post");
        return;
    }

    if (config.dryRun) {
        console.log(`[keeper] DRY_RUN - would post ${updates.length} price(s) at ts=${nowSec}:`);
        for (const u of updates) {
            console.log(`  id ${u.id} ${u.symbol.padEnd(12)} ${u.priceE8.toString()} (1e8 USD)`);
        }
        return;
    }

    // Freshness filter: read each market's on-chain ts (ONE multicall) and skip any where our ts is not
    // strictly newer (the oracle rejects non-increasing ts). Cheap and safe on the stateless Worker.
    const onchain = await publicClient.multicall({
        allowFailure: true,
        contracts: updates.map((u) => ({
            address: config.oracleAddress,
            abi: pushPriceOracleAbi,
            functionName: "getPrice",
            args: [u.id],
        })),
    });
    const fresh = updates.filter((u, i) => {
        const r = onchain[i];
        const onchainTs = r.status === "success" ? (r.result as unknown as readonly [bigint, bigint])[1] : 0n;
        return u.ts > onchainTs;
    });
    if (fresh.length === 0) {
        console.log("[keeper] nothing fresh to post this tick");
        return;
    }

    // Post in CHUNKS. Two reasons, both learned the hard way at 68 markets on the shared public RPC:
    //   1. A single large postPrices batch makes eth_estimateGas FAIL on that RPC, so we split into
    //      small txs AND pass an explicit `gas` limit to skip gas estimation entirely.
    //   2. Cloudflare runs the Worker STATELESS (a fresh isolate per cron fire), so the old round-robin
    //      cursor never advanced and tail markets never posted. Chunking posts EVERY market each tick.
    // POST_BATCH_LIMIT now means "max markets per tx" (0 = one tx for all). The block gas limit is huge
    // (Arbitrum Orbit), so the explicit cap below is never the binding constraint.
    const chunkSize = config.postBatchLimit > 0 ? config.postBatchLimit : fresh.length;
    let nonce = await publicClient.getTransactionCount({address: account.address, blockTag: "pending"});
    let posted = 0;
    for (let start = 0; start < fresh.length; start += chunkSize) {
        const group = fresh.slice(start, start + chunkSize);
        const ids: bigint[] = [];
        const prices: bigint[] = [];
        const timestamps: bigint[] = [];
        const signatures: Hex[] = [];
        for (const u of group) {
            const sig = await signPrice(account, config.chainId, config.oracleAddress, u.id, u.priceE8, u.ts);
            ids.push(u.id);
            prices.push(u.priceE8);
            timestamps.push(u.ts);
            signatures.push(sig);
        }
        const hash = await walletClient.writeContract({
            address: config.oracleAddress,
            abi: pushPriceOracleAbi,
            functionName: "postPrices",
            args: [ids, prices, timestamps, signatures],
            gas: BigInt(ids.length) * 200000n + 300000n,
            nonce: nonce++,
        });
        posted += ids.length;
        console.log(`[keeper] posted ${ids.length} price(s) [chunk]: ${hash}`);
    }
    console.log(`[keeper] posted ${posted} price(s) across ${Math.ceil(fresh.length / chunkSize)} tx(s)`);
}
