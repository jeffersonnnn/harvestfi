-- RWA Perps indexer - Cloudflare D1 (SQLite) schema.
-- Apply: wrangler d1 execute rwa-perps --file=schema.sql   (add --remote to apply to the deployed DB)

-- One row per position, updated across its open -> close lifecycle. bigints stored as TEXT.
CREATE TABLE IF NOT EXISTS positions (
  id           TEXT PRIMARY KEY,      -- positionId
  trader       TEXT NOT NULL,
  commodity_id INTEGER NOT NULL,
  is_long      INTEGER NOT NULL,      -- 0/1
  collateral   TEXT NOT NULL,         -- wei
  size_eth     TEXT NOT NULL,         -- wei
  entry_price  TEXT NOT NULL,         -- 1e8 USD
  opened_at    INTEGER NOT NULL,      -- unix seconds
  status       TEXT NOT NULL,         -- 'open' | 'closed'
  exit_price   TEXT,                  -- 1e8 USD (on close)
  pnl          TEXT,                  -- signed wei (on close)
  payout       TEXT,                  -- wei (on close)
  liquidated   INTEGER,               -- 0/1 (on close)
  closed_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_positions_trader ON positions(trader);

-- Price snapshots for sparklines/history: one row per (market, timestamp). PK dedupes re-reads.
CREATE TABLE IF NOT EXISTS prices (
  commodity_id INTEGER NOT NULL,
  price        TEXT NOT NULL,         -- 1e8 USD
  ts           INTEGER NOT NULL,      -- unix seconds (the oracle timestamp)
  PRIMARY KEY (commodity_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_prices_market ON prices(commodity_id, ts);

-- One row per prediction market, refreshed from state each tick (getMarket).
CREATE TABLE IF NOT EXISTS prediction_markets (
  id            INTEGER PRIMARY KEY,   -- marketId
  commodity_id  INTEGER NOT NULL,
  threshold_e8  TEXT NOT NULL,         -- 1e8 USD
  expiry        INTEGER NOT NULL,      -- unix seconds
  is_above      INTEGER NOT NULL,      -- 0/1
  status        INTEGER NOT NULL,      -- 0 open, 1 resolved, 2 cancelled
  outcome_yes   INTEGER NOT NULL,      -- 0/1 (valid when resolved)
  yes_pool      TEXT NOT NULL,         -- wei
  no_pool       TEXT NOT NULL,         -- wei
  resolved_price TEXT NOT NULL,        -- 1e8 USD (0 until resolved)
  creator       TEXT NOT NULL
);

-- One row per bet / resolution event (activity feed). PK dedupes re-scans.
CREATE TABLE IF NOT EXISTS prediction_bets (
  tx_hash    TEXT NOT NULL,
  log_index  INTEGER NOT NULL,
  kind       TEXT NOT NULL,            -- 'bet' | 'resolved'
  market_id  INTEGER NOT NULL,
  is_yes     INTEGER NOT NULL,         -- 0/1
  amount     TEXT NOT NULL,            -- wei (0 for 'resolved')
  who        TEXT NOT NULL,            -- bettor (zero addr for 'resolved')
  block      INTEGER NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_pred_bets_block ON prediction_bets(block);
CREATE INDEX IF NOT EXISTS idx_pred_bets_market ON prediction_bets(market_id);

-- Indexer bookkeeping (e.g. last-indexed block).
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
