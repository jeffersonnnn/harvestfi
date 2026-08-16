// Client-side "paper trading" state. No wallet, no chain writes - a single-player sandbox that lets a
// visitor feel the full open -> PnL -> close flow before funding a wallet. PnL mirrors the on-chain
// PerpEngine so demo numbers match what a real trade would do.
//
// State lives in localStorage (one key, versioned). All wei values are stored as strings for JSON.

export interface DemoPosition {
  id: number;
  symbol: string;
  commodityId: number;
  isLong: boolean;
  leverage: number;
  collateralWei: string; // margin - openFee
  sizeWei: string; // notional = margin * leverage
  entryPriceE8: string; // 1e8 USD at open
  openedAt: number; // ms
}

export interface DemoState {
  balanceWei: string; // spendable fake ETH
  positions: DemoPosition[];
  nextId: number;
  trades: number; // closed count
  wins: number; // closed with pnl >= 0
}

const KEY = "harvestfi.demo.v1";
export const DEMO_START_WEI = 1_000_000_000_000_000_000n; // 1.0 ETH

function fresh(): DemoState {
  return { balanceWei: DEMO_START_WEI.toString(), positions: [], nextId: 0, trades: 0, wins: 0 };
}

export function loadDemo(): DemoState {
  if (typeof window === "undefined") return fresh();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw) as DemoState;
    // Minimal shape guard - if anything is off, start clean rather than crash the desk.
    if (typeof s.balanceWei !== "string" || !Array.isArray(s.positions)) return fresh();
    return s;
  } catch {
    return fresh();
  }
}

export function saveDemo(s: DemoState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full / blocked - the desk still works in-memory for the session */
  }
}

export function resetDemo(): DemoState {
  const s = fresh();
  saveDemo(s);
  return s;
}

// Price PnL, mirroring PerpEngine._pnl: sizeEth * (mark - entry) / entry, negated for shorts.
// (Funding + borrow carry are excluded here, exactly as the trade panel discloses for the estimate.)
export function demoPnl(p: DemoPosition, markE8: bigint): bigint {
  const entry = BigInt(p.entryPriceE8);
  if (entry === 0n) return 0n;
  const size = BigInt(p.sizeWei);
  const raw = (size * (markE8 - entry)) / entry;
  return p.isLong ? raw : -raw;
}

// Close fee, mirroring PerpEngine: sizeEth * closeFeeBps / 10_000.
export function demoCloseFee(p: DemoPosition, closeFeeBps: number): bigint {
  return (BigInt(p.sizeWei) * BigInt(closeFeeBps)) / 10_000n;
}

export interface DemoCloseOutcome {
  pnlWei: bigint; // signed realized PnL (price term)
  closeFeeWei: bigint;
  payoutWei: bigint; // ETH returned to the demo balance
}

// Realized close: payout = max(0, collateral + pnl) - closeFee (fee capped at payout), like the engine.
export function demoClose(p: DemoPosition, markE8: bigint, closeFeeBps: number): DemoCloseOutcome {
  const pnl = demoPnl(p, markE8);
  let payout = BigInt(p.collateralWei) + pnl;
  if (payout < 0n) payout = 0n;
  let fee = demoCloseFee(p, closeFeeBps);
  if (fee > payout) fee = payout;
  payout -= fee;
  return { pnlWei: pnl, closeFeeWei: fee, payoutWei: payout };
}
