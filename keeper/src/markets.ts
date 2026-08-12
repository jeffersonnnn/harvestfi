import {type Address} from "viem";
import {publicClient} from "./client.js";
import {commodityRegistryAbi} from "./abis.js";
import {COMMODITIES, COMMODITIES_BY_SYMBOL, type CommoditySpec} from "./commodities.js";

const ZERO = "0x0000000000000000000000000000000000000000";

interface OnchainCommodity {
    symbol: string;
    unit: string;
    quoteCurrency: string;
    category: string;
    listed: boolean;
}

/// Discover the ACTIVE market set from the on-chain registry: read every LISTED commodity's id +
/// symbol, then join with the keeper catalog (symbol -> Trading Economics slug + the TRUE quote
/// currency, i.e. the cents/dollars distinction the registry does not store reliably) to build the
/// specs to price.
///
/// The point: listing a new market on-chain (owner `registry.list`) needs NO keeper code change —
/// only a matching catalog entry in commodities.ts. This is what makes the "launch 7 fighters, then
/// add markets incrementally" plan a config change, not a redeploy.
///
/// Falls back to the full static catalog when no registry address is configured (offline dry-run).
export async function discoverMarkets(registryAddress: Address): Promise<CommoditySpec[]> {
    if (!registryAddress || registryAddress.toLowerCase() === ZERO) {
        return COMMODITIES; // offline fallback: full catalog with its static ids
    }

    const count = Number(
        (await publicClient.readContract({
            address: registryAddress,
            abi: commodityRegistryAbi,
            functionName: "count",
        })) as bigint,
    );
    if (count === 0) return [];

    // ONE multicall for all getCommodity reads (not N eth_calls) — required to fit the Cloudflare
    // Workers 50-subrequest cap.
    const results = await publicClient.multicall({
        allowFailure: true,
        contracts: Array.from({length: count}, (_, i) => ({
            address: registryAddress,
            abi: commodityRegistryAbi,
            functionName: "getCommodity",
            args: [BigInt(i)],
        })),
    });

    const specs: CommoditySpec[] = [];
    results.forEach((r, i) => {
        if (r.status !== "success") return;
        const c = r.result as unknown as OnchainCommodity;
        if (!c.listed) return; // delisted: keeper stops posting; existing positions unaffected

        const cat = COMMODITIES_BY_SYMBOL[c.symbol];
        if (!cat) {
            console.warn(
                `[keeper] registry market ${c.symbol} (id ${i}) has no catalog entry in commodities.ts — cannot price, skipping`,
            );
            return;
        }
        specs.push({id: BigInt(i), symbol: c.symbol, teSlug: cat.teSlug, currency: cat.currency, unit: c.unit || cat.unit});
    });
    return specs;
}
