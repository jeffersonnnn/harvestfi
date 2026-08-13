import { createPublicClient, http, defineChain, parseEventLogs } from "viem";
import { engineAbi, oracleAbi, registryAbi, positionClosedEvent } from "./abi";

export interface Env {
  DB: D1Database;
  RPC_URL: string;
  CHAIN_ID: string;
  ENGINE_ADDRESS: `0x${string}`;
  ORACLE_ADDRESS: `0x${string}`;
  REGISTRY_ADDRESS: `0x${string}`;
  START_BLOCK: string;
  MAX_RANGE?: string; // blocks scanned per tick (backfills over runs)
  MAX_BLOCK_META?: string; // cap on per-tick getBlock calls (subrequest budget)
}

function client(env: Env) {
  const chain = defineChain({
    id: Number(env.CHAIN_ID),
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [env.RPC_URL] } },
    contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  });
  return createPublicClient({ chain, transport: http(env.RPC_URL) });
}

async function getMeta(env: Env, key: string, fallback: string): Promise<string> {
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
}

// ---- indexing (cron) ----
async function indexTick(env: Env): Promise<void> {
  const c = client(env);
  const stmts: D1PreparedStatement[] = [];

  // 1) Positions - this RPC returns [] for eth_getLogs, so read positions DIRECTLY: nextPositionId
  // gives the id space; one multicall of getPosition(0..N-1) reads them all. Open positions have a
  // non-zero trader; getPosition returns zero once a position is closed (we mark those closed).
  const nextId = Number(
    await c.readContract({ address: env.ENGINE_ADDRESS, abi: engineAbi, functionName: "nextPositionId" }),
  );
  if (nextId > 0) {
    const posResults = await c.multicall({
      allowFailure: true,
      contracts: Array.from({ length: nextId }, (_, id) => ({
        address: env.ENGINE_ADDRESS,
        abi: engineAbi,
        functionName: "getPosition",
        args: [BigInt(id)],
      })),
    });
    const ZERO = "0x0000000000000000000000000000000000000000";
    posResults.forEach((r, id) => {
      if (r.status !== "success") return;
      const p = r.result as unknown as {
        trader: string;
        commodityId: bigint;
        isLong: boolean;
        collateral: bigint;
        sizeEth: bigint;
        entryPrice: bigint;
        openedAt: bigint;
      };
      if (p.trader && p.trader.toLowerCase() !== ZERO) {
        stmts.push(
          env.DB.prepare(
            `INSERT OR REPLACE INTO positions
             (id, trader, commodity_id, is_long, collateral, size_eth, entry_price, opened_at, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
          ).bind(
            String(id),
            p.trader.toLowerCase(),
            Number(p.commodityId),
            p.isLong ? 1 : 0,
            p.collateral.toString(),
            p.sizeEth.toString(),
            p.entryPrice.toString(),
            Number(p.openedAt),
          ),
        );
      } else {
        // Closed on-chain (getPosition zeroed) - flip any row we had to closed. Realized PnL/exit
        // aren't available from reads (logs are dead); the app captures those from the close receipt.
        stmts.push(
          env.DB.prepare("UPDATE positions SET status='closed', closed_at=? WHERE id=? AND status='open'").bind(
            Math.floor(Date.now() / 1000),
            String(id),
          ),
        );
      }
    });
  }

  // 2) Price snapshots - read every listed market's current oracle price (one multicall) and store it.
  const count = Number(
    await c.readContract({ address: env.REGISTRY_ADDRESS, abi: registryAbi, functionName: "count" }),
  );
  if (count > 0) {
    const results = await c.multicall({
      allowFailure: true,
      contracts: Array.from({ length: count }, (_, id) => ({
        address: env.ORACLE_ADDRESS, abi: oracleAbi, functionName: "getPrice", args: [BigInt(id)],
      })),
    });
    results.forEach((r, id) => {
      if (r.status !== "success") return;
      const [price, ts] = r.result as unknown as readonly [bigint, bigint];
      if (price <= 0n || ts === 0n) return;
      stmts.push(
        env.DB.prepare("INSERT OR IGNORE INTO prices (commodity_id, price, ts) VALUES (?, ?, ?)").bind(
          id, price.toString(), Number(ts),
        ),
      );
    });
  }

  if (stmts.length > 0) await env.DB.batch(stmts);
}

// ---- read API (frontend) ----
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Content-Type": "application/json",
};
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: CORS });

// Record a close from its transaction receipt: fetch the receipt (works even though eth_getLogs
// doesn't), decode the real PositionClosed event, and write the realized PnL/exit/payout. Trustless -
// the values come from the on-chain receipt, not the caller.
async function recordClose(env: Env, txHash: string): Promise<Response> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return json({ error: "bad txHash" });
  const receipt = await client(env).getTransactionReceipt({ hash: txHash as `0x${string}` });
  const events = parseEventLogs({ abi: [positionClosedEvent], logs: receipt.logs, eventName: "PositionClosed" });
  if (events.length === 0) return json({ error: "no PositionClosed in tx" });

  const stmts = events.map((e) => {
    const a = e.args as unknown as {
      positionId: bigint; exitPrice: bigint; pnl: bigint; payout: bigint; liquidated: boolean;
    };
    return env.DB.prepare(
      "UPDATE positions SET status='closed', exit_price=?, pnl=?, payout=?, liquidated=?, closed_at=? WHERE id=?",
    ).bind(
      a.exitPrice.toString(), a.pnl.toString(), a.payout.toString(), a.liquidated ? 1 : 0,
      Math.floor(Date.now() / 1000), a.positionId.toString(),
    );
  });
  await env.DB.batch(stmts);
  return json({ ok: true, closed: events.length });
}

async function handleApi(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const p = url.pathname;

  if (p === "/" || p === "/health") return json({ ok: true });

  if (p === "/close" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { txHash?: string };
    return recordClose(env, body.txHash ?? "");
  }

  if (p === "/positions") {
    const trader = (url.searchParams.get("trader") ?? "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(trader)) return json({ error: "bad trader" });
    const { results } = await env.DB.prepare(
      "SELECT * FROM positions WHERE trader = ? ORDER BY opened_at DESC LIMIT 200",
    ).bind(trader).all();
    return json(results);
  }

  const pos = p.match(/^\/position\/(\d+)$/);
  if (pos) {
    const row = await env.DB.prepare("SELECT * FROM positions WHERE id = ?").bind(pos[1]).first();
    return json(row ?? null);
  }

  if (p === "/prices") {
    const market = Number(url.searchParams.get("market"));
    const limit = Math.min(500, Number(url.searchParams.get("limit") ?? "120"));
    if (!Number.isInteger(market)) return json({ error: "bad market" });
    const { results } = await env.DB.prepare(
      "SELECT price, ts FROM prices WHERE commodity_id = ? ORDER BY ts DESC LIMIT ?",
    ).bind(market, limit).all();
    return json((results ?? []).reverse()); // chronological for charting
  }

  return json({ error: "not found" });
}

export default {
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(indexTick(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handleApi(req, env);
    } catch (e) {
      return json({ error: String((e as Error)?.message ?? e).slice(0, 140) });
    }
  },
};
