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

    // Live: drop any commodity whose on-chain timestamp is already >= now (contract requires
    // strictly increasing, non-future timestamps).
    const ids: bigint[] = [];
    const prices: bigint[] = [];
    const timestamps: bigint[] = [];
    const signatures: Hex[] = [];

    // ONE multicall for all on-chain timestamp reads (not N eth_calls) — required to fit the Cloudflare
    // Workers 50-subrequest cap. Signing below is local (no subrequests).
    const onchain = await publicClient.multicall({
        allowFailure: true,
        contracts: updates.map((u) => ({
            address: config.oracleAddress,
            abi: pushPriceOracleAbi,
            functionName: "getPrice",
            args: [u.id],
        })),
    });

    // Which updates are actually ahead of on-chain? Pair each with its on-chain ts, stalest first.
    const pending = updates
        .map((u, i) => {
            const r = onchain[i];
            const onchainTs = r.status === "success" ? (r.result as unknown as readonly [bigint, bigint])[1] : 0n;
            return {u, onchainTs};
        })
        .filter((x) => x.u.ts > x.onchainTs)
        .sort((a, b) => (a.onchainTs < b.onchainTs ? -1 : a.onchainTs > b.onchainTs ? 1 : 0));

    // Cap signatures per tick to fit a CPU-limited host; 0 = post them all.
    const toPost = config.postBatchLimit > 0 ? pending.slice(0, config.postBatchLimit) : pending;

    for (const {u} of toPost) {
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
