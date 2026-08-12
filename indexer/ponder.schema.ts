import {onchainTable} from "ponder";

/// One row per position, updated in place across its open -> close lifecycle. This is what the
/// frontend queries instead of scanning `getLogs` (the current O(all history) approach).
export const position = onchainTable("position", (t) => ({
    id: t.bigint().primaryKey(), // positionId
    trader: t.hex().notNull(),
    commodityId: t.integer().notNull(),
    isLong: t.boolean().notNull(),
    collateral: t.bigint().notNull(),
    sizeEth: t.bigint().notNull(),
    entryPrice: t.bigint().notNull(),
    openedAt: t.bigint().notNull(),
    status: t.text().notNull(), // "open" | "closed"
    // set on close:
    exitPrice: t.bigint(),
    pnl: t.bigint(),
    payout: t.bigint(),
    liquidated: t.boolean(),
    closedAt: t.bigint(),
}));
