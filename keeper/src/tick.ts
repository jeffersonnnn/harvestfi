import {type Address, type Hex} from "viem";
import {config} from "./config.js";
import {account, publicClient, walletClient} from "./client.js";
import {pushPriceOracleAbi} from "./abis.js";
import {normalizeToE8} from "./normalize.js";
import {fetchFxRates} from "./fx.js";
import {selectSource} from "./sources.js";
import {signPrice} from "./sign.js";
import {discoverMarkets} from "./markets.js";

/// The keeper's core work, factored out so BOTH the Node long-running loop (index.ts) and the
/// Cloudflare Worker (worker/worker.ts, one tick per cron fire) call the same code path.

interface Update {
    id: bigint;
    symbol: string;
    priceE8: bigint;
    ts: bigint;
}

// Round-robin cursor for batched (CPU-limited) posting.
let _rr = 0;

/// Build the normalized, timestamped price updates for this tick.
async function buildUpdates(nowSec: bigint): Promise<Update[]> {
    const source = selectSource();
    // Discover the active market set from the registry each tick, so markets added on-chain are
    // picked up automatically (no restart, no code change). Falls back to the static catalog offline.
    const markets = await discoverMarkets(config.registryAddress);
    const raw = await source.fetchPrices(markets);

    const currencies = markets.map((c) => c.currency);
    const fx = await fetchFxRates(currencies);

    const updates: Update[] = [];
    for (const c of markets) {
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
        console.log(`[keeper] DRY_RUN — would post ${updates.length} price(s) at ts=${nowSec}:`);
        for (const u of updates) {
            console.log(`  id ${u.id} ${u.symbol.padEnd(12)} ${u.priceE8.toString()} (1e8 USD)`);
        }
        return;
    }

    const ids: bigint[] = [];
    const prices: bigint[] = [];
    const timestamps: bigint[] = [];
    const signatures: Hex[] = [];

    let toPost: Update[];
    if (config.postBatchLimit > 0) {
        // CPU-limited host (e.g. Cloudflare Workers free): post the next N markets round-robin, with
        // NO on-chain reads — nowSec is always ahead of each market's last post (it cycles every few
        // ticks), so the strictly-increasing-ts rule holds without checking. Minimal CPU per tick.
        const n = Math.min(config.postBatchLimit, updates.length);
        toPost = [];
        for (let k = 0; k < n; k++) toPost.push(updates[(_rr + k) % updates.length]);
        _rr = (_rr + n) % updates.length;
    } else {
        // Unmetered host: read every on-chain ts in one multicall, post everything strictly ahead.
        const onchain = await publicClient.multicall({
            allowFailure: true,
            contracts: updates.map((u) => ({
                address: config.oracleAddress,
                abi: pushPriceOracleAbi,
                functionName: "getPrice",
                args: [u.id],
            })),
        });
        toPost = updates.filter((u, i) => {
            const r = onchain[i];
            const onchainTs = r.status === "success" ? (r.result as unknown as readonly [bigint, bigint])[1] : 0n;
            return u.ts > onchainTs;
        });
    }

    for (const u of toPost) {
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
