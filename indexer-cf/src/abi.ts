// Minimal ABIs the indexer needs. Position events verified against PerpEngine.sol / app abis.

export const positionOpenedEvent = {
  type: "event",
  name: "PositionOpened",
  inputs: [
    { name: "positionId", type: "uint256", indexed: true },
    { name: "trader", type: "address", indexed: true },
    { name: "commodityId", type: "uint256", indexed: true },
    { name: "isLong", type: "bool", indexed: false },
    { name: "collateral", type: "uint256", indexed: false },
    { name: "sizeEth", type: "uint256", indexed: false },
    { name: "entryPrice", type: "uint256", indexed: false },
  ],
} as const;

export const positionClosedEvent = {
  type: "event",
  name: "PositionClosed",
  inputs: [
    { name: "positionId", type: "uint256", indexed: true },
    { name: "trader", type: "address", indexed: true },
    { name: "commodityId", type: "uint256", indexed: true },
    { name: "exitPrice", type: "uint256", indexed: false },
    { name: "pnl", type: "int256", indexed: false },
    { name: "closeFee", type: "uint256", indexed: false },
    { name: "borrowFee", type: "uint256", indexed: false },
    { name: "liqFee", type: "uint256", indexed: false },
    { name: "payout", type: "uint256", indexed: false },
    { name: "liquidated", type: "bool", indexed: false },
  ],
} as const;

export const oracleAbi = [
  {
    type: "function",
    name: "getPrice",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "price", type: "int256" },
      { name: "timestamp", type: "uint64" },
    ],
  },
] as const;

export const registryAbi = [
  {
    type: "function",
    name: "count",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
