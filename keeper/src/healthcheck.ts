import {publicClient} from "./client.js";
import {pushPriceOracleAbi} from "./abis.js";
import {config} from "./config.js";

/// Liveness probe for monitoring/alerting: reads a market's on-chain price age and exits non-zero if
/// it is older than the keeper's max age (i.e. the keeper has stopped posting). Wire it to a cron /
/// systemd timer / uptime monitor and alert on a non-zero exit.
///
///   HEALTHCHECK_ID=6 tsx src/healthcheck.ts   # 6 = CORN by default
///
/// Exit codes: 0 = fresh, 1 = stale, 2 = could not read (RPC/config problem).
const MARKET_ID = BigInt(process.env.HEALTHCHECK_ID ?? "0");
// Alert threshold: default to 2x the post interval (a missed tick or two), min 120s.
const maxAgeSec = Math.max(120, Math.floor((config.postIntervalMs / 1000) * 2));

async function main() {
    const [price, ts] = (await publicClient.readContract({
        address: config.oracleAddress,
        abi: pushPriceOracleAbi,
        functionName: "getPrice",
        args: [MARKET_ID],
    })) as readonly [bigint, bigint];

    if (ts === 0n || price <= 0n) {
        console.error(`[health] market ${MARKET_ID} has no price on ${config.oracleAddress}`);
        process.exit(1);
    }
    const ageSec = Math.floor(Date.now() / 1000) - Number(ts);
    if (ageSec > maxAgeSec) {
        console.error(`[health] STALE: market ${MARKET_ID} price is ${ageSec}s old (> ${maxAgeSec}s) — keeper down?`);
        process.exit(1);
    }
    console.log(`[health] OK: market ${MARKET_ID} price ${age(ageSec)} old`);
}

const age = (s: number) => `${s}s`;

main().catch((e) => {
    console.error(`[health] read failed: ${(e as Error).message}`);
    process.exit(2);
});
