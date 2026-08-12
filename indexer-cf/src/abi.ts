// Minimal ABIs the indexer needs. This RPC returns [] for eth_getLogs, so positions are read
// directly via nextPositionId + getPosition (no event logs). Prices via the oracle.

export const engineAbi = [
  {
    type: "function",
    name: "nextPositionId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "trader", type: "address" },
          { name: "commodityId", type: "uint256" },
          { name: "isLong", type: "bool" },
          { name: "collateral", type: "uint256" },
          { name: "sizeEth", type: "uint256" },
          { name: "entryPrice", type: "uint256" },
          { name: "entryFundingIndex", type: "int256" },
          { name: "entryBorrowingIndex", type: "uint256" },
          { name: "openedAt", type: "uint64" },
        ],
      },
    ],
  },
] as const;

// For decoding a close from its transaction receipt (eth_getTransactionReceipt works; eth_getLogs does not).
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
