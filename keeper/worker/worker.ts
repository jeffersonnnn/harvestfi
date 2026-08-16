/// Cloudflare Worker keeper - a Cron Trigger fires this every minute and it posts one price tick.
/// Runs always-on in Cloudflare's edge (no VPS, no laptop), free tier. The signing key lives as an
/// encrypted Worker Secret, not plaintext on a host.
///
/// Deploy: see worker/README.md. Requires the `nodejs_compat` flag (set in wrangler.toml).

export interface Env {
    PRICE_SOURCE: string;
    TE_API_KEY: string; // secret
    RPC_URL: string;
    CHAIN_ID: string;
    ORACLE_ADDRESS: string;
    REGISTRY_ADDRESS: string;
    PRIVATE_KEY: string; // secret (price signer = oracle trustedSigner)
    POST_INTERVAL_MS?: string;
    POST_BATCH_LIMIT?: string;
    DRY_RUN?: string;
    // Prediction-market auto-resolve (separate cron)
    PREDICTION_ADDRESS?: string;
    RESOLVE_KEY?: string; // secret (optional; falls back to PRIVATE_KEY)
    RESOLVE_LIMIT?: string;
    // Strategy crank (separate signer; currently unwired — kept for the CLI path)
    CRANKER_KEY?: string; // secret (strategy cranker; distinct from PRICE signer)
    LAUNCH_REGISTRY?: string;
    BENEFICIARY_VAULT?: string;
    LAUNCH_LIMIT?: string;
}

// The */15 cron settles expired prediction markets (resolve/cancel). Keep in sync with wrangler.toml.
// (Repurposed from the now-unwired strategy crank; strategy still runs via the CLI if ever needed.)
const RESOLVE_CRON = "*/15 * * * *";

function inject(env: Env, keys: (keyof Env)[]) {
    for (const k of keys) if (env[k] != null) process.env[k] = String(env[k]);
}

export default {
    async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        // The shared keeper modules read config from process.env at import time, so inject the Worker
        // env FIRST, then dynamic-import so config picks it up.

        // Auto-resolve (every 15 min): settle expired prediction markets. Uses RESOLVE_KEY ?? PRIVATE_KEY.
        if (event.cron === RESOLVE_CRON) {
            inject(env, ["RPC_URL", "CHAIN_ID", "PREDICTION_ADDRESS", "RESOLVE_KEY", "PRIVATE_KEY", "DRY_RUN", "RESOLVE_LIMIT"]);
            const {resolveOnce} = await import("../src/resolve-core.js");
            ctx.waitUntil(resolveOnce());
            return;
        }

        // Default (every minute): post one price tick. Uses PRIVATE_KEY (the oracle signer).
        inject(env, [
            "PRICE_SOURCE",
            "TE_API_KEY",
            "RPC_URL",
            "CHAIN_ID",
            "ORACLE_ADDRESS",
            "REGISTRY_ADDRESS",
            "PRIVATE_KEY",
            "POST_INTERVAL_MS",
            "POST_BATCH_LIMIT",
            "DRY_RUN",
        ]);
        const {runOnce, assertTrustedSigner} = await import("../src/tick.js");
        ctx.waitUntil(
            (async () => {
                // Non-fatal: a 429 on this one read must not abort the whole post. If the signer were
                // actually wrong the postPrices tx would revert on its own.
                if (env.DRY_RUN !== "true") {
                    try {
                        await assertTrustedSigner();
                    } catch (e) {
                        console.warn("[keeper] trustedSigner precheck skipped:", (e as Error).message?.slice(0, 120));
                    }
                }
                await runOnce();
            })(),
        );
    },
};
