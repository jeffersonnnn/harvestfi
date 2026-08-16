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

// PredictionMarket: markets read from state (getMarket), bets from BetPlaced logs.
export const predictionAbi = [
  { type: "function", name: "marketCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "commodityId", type: "uint256" },
          { name: "thresholdE8", type: "uint256" },
          { name: "expiry", type: "uint64" },
          { name: "isAbove", type: "bool" },
          { name: "status", type: "uint8" },
          { name: "outcomeYes", type: "bool" },
          { name: "yesPool", type: "uint256" },
          { name: "noPool", type: "uint256" },
          { name: "winnerPool", type: "uint256" },
          { name: "netLosingPool", type: "uint256" },
          { name: "resolvedPrice", type: "uint256" },
          { name: "creator", type: "address" },
        ],
      },
    ],
  },
] as const;

export const betPlacedEvent = {
  type: "event",
  name: "BetPlaced",
  inputs: [
    { name: "marketId", type: "uint256", indexed: true },
    { name: "bettor", type: "address", indexed: true },
    { name: "isYes", type: "bool", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
  ],
} as const;

export const marketResolvedEvent = {
  type: "event",
  name: "MarketResolved",
  inputs: [
    { name: "marketId", type: "uint256", indexed: true },
    { name: "outcomeYes", type: "bool", indexed: false },
    { name: "price", type: "uint256", indexed: false },
    { name: "fee", type: "uint256", indexed: false },
  ],
} as const;
