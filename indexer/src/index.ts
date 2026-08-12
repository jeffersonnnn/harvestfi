import {ponder} from "ponder:registry";
import {position} from "ponder:schema";

// PositionOpened -> create the row.
ponder.on("PerpEngine:PositionOpened", async ({event, context}) => {
    await context.db.insert(position).values({
        id: event.args.positionId,
        trader: event.args.trader,
        commodityId: Number(event.args.commodityId),
        isLong: event.args.isLong,
        collateral: event.args.collateral,
        sizeEth: event.args.sizeEth,
        entryPrice: event.args.entryPrice,
        openedAt: event.block.timestamp,
        status: "open",
    });
});

// PositionClosed -> mark the row closed with the realized outcome (same data the PnL card uses).
ponder.on("PerpEngine:PositionClosed", async ({event, context}) => {
    await context.db.update(position, {id: event.args.positionId}).set({
        status: "closed",
        exitPrice: event.args.exitPrice,
        pnl: event.args.pnl,
        payout: event.args.payout,
        liquidated: event.args.liquidated,
        closedAt: event.block.timestamp,
    });
});
