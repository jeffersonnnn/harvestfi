import {type Address, type Hex} from "viem";

function env(key: string, fallback?: string): string {
    const val = process.env[key] ?? fallback;
    if (val === undefined) throw new Error(`Missing env: ${key}`);
    return val;
}

export const config = {
    rpcUrl: env("RPC_URL", "https://rpc.mainnet.chain.robinhood.com"),
    chainId: Number(env("CHAIN_ID", "4663")),
    oracleAddress: env("ORACLE_ADDRESS", "0x0000000000000000000000000000000000000000") as Address,
    // When set, the keeper DISCOVERS the market set (ids + symbols) from the on-chain registry, so
    // listing a new market needs no keeper code change. Unset (zero) => fall back to the static catalog.
    registryAddress: env("REGISTRY_ADDRESS", "0x0000000000000000000000000000000000000000") as Address,
    // Default is the well-known Anvil dev key #0 — a PLACEHOLDER so dry-run works out of the box.
    // MUST be overridden with the real trusted-signer key for any live posting.
    privateKey: env("PRIVATE_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as Hex,
    postIntervalMs: Number(env("POST_INTERVAL_MS", "60000")),
    minMoveBps: Number(env("MIN_MOVE_BPS", "0")),
    priceSource: env("PRICE_SOURCE", "static"),
    teApiKey: env("TE_API_KEY", ""),
    pythHermesUrl: env("PYTH_HERMES_URL", "https://hermes.pyth.network"),
    // Drop a Pyth feed whose publish_time is older than this (seconds). Lets a CLOSED market
    // (weekends/overnight) stop getting fresh posts so the on-chain stale mechanism can kick in,
    // instead of re-stamping an old price as current. 0 disables the guard.
    pythMaxStaleSec: Number(env("PYTH_MAX_STALE_SEC", "300")),
    // Yahoo Finance source (grains + full registry, incl. rice/cotton which Pyth lacks).
    yahooBaseUrl: env("YAHOO_BASE_URL", "https://query1.finance.yahoo.com"),
    // Skip a Yahoo quote whose regularMarketTime is older than this (seconds); 0 disables (post last
    // close continuously — nicer for a 24/7 demo; enable it to respect real CME session hours).
    yahooMaxStaleSec: Number(env("YAHOO_MAX_STALE_SEC", "0")),
    fxApiUrl: env("FX_API_URL", "https://open.er-api.com/v6/latest/USD"),
    dryRun: env("DRY_RUN", "true").toLowerCase() === "true",
} as const;
