// Minimal PerpEngine ABI for indexing - the position lifecycle events only.
// Param lists verified against contracts/src/PerpEngine.sol + app/src/lib/abis.ts (2026-08-12).
export const PerpEngineAbi = [
    {
        type: "event",
        name: "PositionOpened",
        inputs: [
            {name: "positionId", type: "uint256", indexed: true},
            {name: "trader", type: "address", indexed: true},
            {name: "commodityId", type: "uint256", indexed: true},
            {name: "isLong", type: "bool", indexed: false},
            {name: "collateral", type: "uint256", indexed: false},
            {name: "sizeEth", type: "uint256", indexed: false},
            {name: "entryPrice", type: "uint256", indexed: false},
        ],
    },
    {
        type: "event",
        name: "PositionClosed",
        inputs: [
            {name: "positionId", type: "uint256", indexed: true},
            {name: "trader", type: "address", indexed: true},
            {name: "commodityId", type: "uint256", indexed: true},
            {name: "exitPrice", type: "uint256", indexed: false},
            {name: "pnl", type: "int256", indexed: false},
            {name: "closeFee", type: "uint256", indexed: false},
            {name: "borrowFee", type: "uint256", indexed: false},
            {name: "liqFee", type: "uint256", indexed: false},
            {name: "payout", type: "uint256", indexed: false},
            {name: "liquidated", type: "bool", indexed: false},
        ],
    },
] as const;
