/// Cloudflare Worker keeper — a Cron Trigger fires this every minute and it posts one price tick.
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
    PRIVATE_KEY: string; // secret
    POST_INTERVAL_MS?: string;
    DRY_RUN?: string;
}

export default {
    async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        // The shared keeper modules read config from process.env at import time, so inject the Worker
        // env FIRST, then dynamic-import the tick so config picks it up.
        const keys: (keyof Env)[] = [
            "PRICE_SOURCE",
            "TE_API_KEY",
            "RPC_URL",
            "CHAIN_ID",
            "ORACLE_ADDRESS",
            "REGISTRY_ADDRESS",
            "PRIVATE_KEY",
            "POST_INTERVAL_MS",
            "DRY_RUN",
        ];
        for (const k of keys) if (env[k] != null) process.env[k] = String(env[k]);

        const {runOnce, assertTrustedSigner} = await import("../src/tick.js");
        ctx.waitUntil(
            (async () => {
                if (env.DRY_RUN !== "true") await assertTrustedSigner();
                await runOnce();
            })(),
        );
    },
};
