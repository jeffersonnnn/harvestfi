// Node long-running strategy keeper: crank once, then every POLL_INTERVAL_MS. (The Cloudflare Worker in
// worker/ calls crankOnce() once per cron fire instead of this loop.)
//
//   RPC_URL=... CHAIN_ID=4663 PRIVATE_KEY=0x<cranker> DRY_RUN=false POLL_INTERVAL_MS=60000 \
//     LAUNCH_REGISTRY=0x59a2... npm run strategy
import {crankOnce, cranker, strategyConfig} from "./strategy-core.js";

const POLL = Number(process.env.POLL_INTERVAL_MS ?? "60000");

console.log(
    `[strategy-keeper] rpc=${strategyConfig.RPC} chain=${strategyConfig.CHAIN_ID} dryRun=${strategyConfig.DRY} poll=${POLL}ms registry=${strategyConfig.LAUNCH_REGISTRY}`
);
if (cranker) console.log(`[strategy-keeper] cranker=${cranker}`);

await crankOnce();
setInterval(() => {
    crankOnce().catch((e) => console.error("[strategy-keeper] tick error:", (e as Error).message?.slice(0, 200)));
}, POLL);
