import { createPublicClient, http, defineChain } from "viem";
import { positionOpenedEvent, positionClosedEvent, oracleAbi, registryAbi } from "./abi";

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

  // 1) Positions via logs, incremental + range-capped (backfills over successive ticks).
  const latest = await c.getBlockNumber();
  const last = BigInt(await getMeta(env, "lastBlock", env.START_BLOCK));
  const maxRange = BigInt(env.MAX_RANGE ?? "3000");
  const from = last + 1n;
  const to = from + maxRange - 1n > latest ? latest : from + maxRange - 1n;

  if (to >= from) {
    const [opened, closed] = await Promise.all([
      c.getLogs({ address: env.ENGINE_ADDRESS, event: positionOpenedEvent, fromBlock: from, toBlock: to }),
      c.getLogs({ address: env.ENGINE_ADDRESS, event: positionClosedEvent, fromBlock: from, toBlock: to }),
    ]);

    // Best-effort block timestamps (unique blocks, capped by subrequest budget).
    const blocks = [...new Set([...opened, ...closed].map((l) => l.blockNumber!))];
    const cap = Number(env.MAX_BLOCK_META ?? "24");
    const tsByBlock = new Map<bigint, number>();
    await Promise.all(
      blocks.slice(0, cap).map(async (bn) => {
        const b = await c.getBlock({ blockNumber: bn });
        tsByBlock.set(bn, Number(b.timestamp));
      }),
    );

    for (const l of opened) {
      const a = l.args as {
        positionId: bigint; trader: string; commodityId: bigint;
        isLong: boolean; collateral: bigint; sizeEth: bigint; entryPrice: bigint;
      };
      stmts.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO positions
           (id, trader, commodity_id, is_long, collateral, size_eth, entry_price, opened_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        ).bind(
          a.positionId.toString(), a.trader.toLowerCase(), Number(a.commodityId), a.isLong ? 1 : 0,
          a.collateral.toString(), a.sizeEth.toString(), a.entryPrice.toString(),
          tsByBlock.get(l.blockNumber!) ?? 0,
        ),
      );
    }
    for (const l of closed) {
      const a = l.args as {
        positionId: bigint; exitPrice: bigint; pnl: bigint; payout: bigint; liquidated: boolean;
      };
      stmts.push(
        env.DB.prepare(
          `UPDATE positions SET status='closed', exit_price=?, pnl=?, payout=?, liquidated=?, closed_at=? WHERE id=?`,
        ).bind(
          a.exitPrice.toString(), a.pnl.toString(), a.payout.toString(), a.liquidated ? 1 : 0,
          tsByBlock.get(l.blockNumber!) ?? 0, a.positionId.toString(),
        ),
      );
    }
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('lastBlock', ?)").bind(to.toString()));
  }

  // 2) Price snapshots — read every listed market's current oracle price (one multicall) and store it.
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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: CORS });

async function handleApi(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const p = url.pathname;

  if (p === "/" || p === "/health") return json({ ok: true });

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
    return handleApi(req, env);
  },
};
