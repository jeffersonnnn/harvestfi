// Client for the Cloudflare D1 indexer (positions + price history). Falls back to the deployed URL.
export const INDEXER_URL =
  process.env.NEXT_PUBLIC_INDEXER_URL ?? "https://rwa-perps-indexer.aijeffersonighalo.workers.dev";

export interface IndexedPosition {
  id: string;
  trader: string;
  commodity_id: number;
  is_long: number;
  collateral: string;
  size_eth: string;
  entry_price: string;
  opened_at: number;
  status: string; // 'open' | 'closed'
  exit_price: string | null;
  pnl: string | null;
  payout: string | null;
  liquidated: number | null;
  closed_at: number | null;
}

export interface PricePoint {
  price: string; // 1e8 USD
  ts: number;
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${INDEXER_URL}${path}`, { cache: "no-store" });
    if (!r.ok) return fallback;
    const d = await r.json();
    return (d ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export const fetchPositions = (trader: string) =>
  getJson<IndexedPosition[]>(`/positions?trader=${trader.toLowerCase()}`, []);

export const fetchPriceHistory = (market: number, limit = 48) =>
  getJson<PricePoint[]>(`/prices?market=${market}&limit=${limit}`, []);

export const fetchPosition = (id: string) =>
  getJson<IndexedPosition | null>(`/position/${id}`, null);
