import {config} from "./config.js";
import {account} from "./client.js";
import {runOnce, assertTrustedSigner} from "./tick.js";

/// Node long-running keeper: post once, then every POST_INTERVAL_MS. (The Cloudflare Worker in
/// worker/ calls runOnce() once per cron fire instead of this loop.)
async function main() {
    console.log(`[keeper] RWA perps price keeper`);
    console.log(`[keeper] source=${config.priceSource} chainId=${config.chainId} dryRun=${config.dryRun}`);
    console.log(`[keeper] oracle=${config.oracleAddress} signer=${account.address}`);

    if (!config.dryRun) await assertTrustedSigner();

    await runOnce();
    setInterval(() => {
        runOnce().catch((e) => console.error("[keeper] tick error:", (e as Error).message.slice(0, 200)));
    }, config.postIntervalMs);
}

main().catch((e) => {
    console.error("[keeper] fatal:", e);
    process.exit(1);
});
