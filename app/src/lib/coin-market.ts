import {
  type Address,
  type Hex,
  type PublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseAbiItem,
} from "viem";

// Uniswap v4 on Robinhood Chain (4663). Launched coins are ETH-paired v4 pools, no hook.
export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address;
export const STATE_VIEW = "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b" as Address;
export const UNIVERSAL_ROUTER = "0x8876789976dEcBfCbBbe364623C63652db8C0904" as Address;
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
export const ZERO = "0x0000000000000000000000000000000000000000" as Address;

// pools.trade graduated pool params (verified on-chain): ETH/token, 0.25% fee, tickSpacing 25, no hook.
export const POOL_FEE = 2500;
export const POOL_TICK_SPACING = 25;
export const TOKEN_SUPPLY = 1_000_000_000n; // 1B whole tokens

const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "35300227");

export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
]);

const SWAP_EVENT = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
);

/** v4 poolId = keccak256(abi.encode(PoolKey)); currency0 is ETH (0x0), currency1 the token. */
export function poolIdFor(token: Address): Hex {
  const encoded = encodeAbiParameters(
    [
      { type: "address" }, // currency0 (ETH)
      { type: "address" }, // currency1 (token)
      { type: "uint24" }, // fee
      { type: "int24" }, // tickSpacing
      { type: "address" }, // hooks
    ],
    [ZERO, token, POOL_FEE, POOL_TICK_SPACING, ZERO]
  );
  return keccak256(encoded);
}

/** Price of 1 coin in ETH from sqrtPriceX96 (currency0=ETH, currency1=coin). */
export function coinPriceEth(sqrtPriceX96: bigint): number {
  const r = Number(sqrtPriceX96) / 2 ** 96; // sqrt(coinPerEth)
  const coinPerEth = r * r;
  return coinPerEth > 0 ? 1 / coinPerEth : 0;
}

export type CoinStats = {
  priceEth: number;
  liquidity: bigint;
  points: { t: number; v: number }[]; // price history in ETH (v)
  volumeEth24h: number;
  trades: number;
};

/** Reads current price + swap history for a coin's pool. `ethUsd` scales the chart/prices to USD. */
export async function fetchCoinStats(
  client: PublicClient,
  token: Address,
  ethUsd: number
): Promise<CoinStats> {
  const poolId = poolIdFor(token);

  const [slot0, liquidity, latest] = await Promise.all([
    client.readContract({ address: STATE_VIEW, abi: stateViewAbi, functionName: "getSlot0", args: [poolId] }),
    client.readContract({ address: STATE_VIEW, abi: stateViewAbi, functionName: "getLiquidity", args: [poolId] }),
    client.getBlock(),
  ]);
  const sqrtNow = (slot0 as readonly [bigint, number, number, number])[0];
  const priceEth = coinPriceEth(sqrtNow);

  const latestNum = latest.number ?? 0n;
  const latestTs = Number(latest.timestamp);
  const blockToT = (bn: bigint) => latestTs - Number(latestNum - bn) * 0.1; // ~100ms blocks

  type SwapLog = { args: { sqrtPriceX96?: bigint; amount0?: bigint }; blockNumber: bigint | null };
  let logs: SwapLog[] = [];
  try {
    logs = (await client.getLogs({
      address: POOL_MANAGER,
      event: SWAP_EVENT,
      args: { id: poolId },
      fromBlock: DEPLOY_BLOCK,
      toBlock: "latest",
    })) as unknown as SwapLog[];
  } catch {
    logs = [];
  }

  const points: { t: number; v: number }[] = [];
  let volumeEth24h = 0;
  const dayAgo = latestTs - 86400;
  for (const log of logs) {
    const a = log.args;
    if (a.sqrtPriceX96 === undefined) continue;
    const t = blockToT(log.blockNumber ?? latestNum);
    points.push({ t, v: coinPriceEth(a.sqrtPriceX96) * ethUsd });
    if (t >= dayAgo && a.amount0 !== undefined) {
      volumeEth24h += Math.abs(Number(a.amount0)) / 1e18;
    }
  }
  // Always end on the live price.
  points.push({ t: latestTs, v: priceEth * ethUsd });
  points.sort((p, q) => p.t - q.t);

  return { priceEth, liquidity: liquidity as bigint, points, volumeEth24h, trades: logs.length };
}

export function marketCapUsd(priceEth: number, ethUsd: number): number {
  return priceEth * ethUsd * Number(TOKEN_SUPPLY);
}

// ---- Uniswap v4 swap via UniversalRouter ----

export const universalRouterAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
export const permit2Abi = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);
export const erc20AllowanceAbi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const V4_SWAP = "0x10"; // UniversalRouter command
const ACTIONS_SWAP_SETTLE_TAKE = "0x060c0f"; // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
const POOL_KEY_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

/** Build an exact-in v4 swap through the UniversalRouter. Buy = ETH->token (zeroForOne). */
export function buildExactInSwap(args: {
  token: Address;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMin: bigint;
  deadline?: bigint;
}): { to: Address; data: Hex; value: bigint } {
  const { token, zeroForOne, amountIn, amountOutMin } = args;
  const poolKey = { currency0: ZERO, currency1: token, fee: POOL_FEE, tickSpacing: POOL_TICK_SPACING, hooks: ZERO };
  const inputCurrency = zeroForOne ? ZERO : token;
  const outputCurrency = zeroForOne ? token : ZERO;

  const swapParams = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [{ poolKey, zeroForOne, amountIn, amountOutMinimum: amountOutMin, hookData: "0x" }]
  );
  const settleParams = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [inputCurrency, amountIn]);
  const takeParams = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [outputCurrency, amountOutMin]);

  const input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [ACTIONS_SWAP_SETTLE_TAKE, [swapParams, settleParams, takeParams]]
  );
  const deadline = args.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 1200);
  const data = encodeFunctionData({ abi: universalRouterAbi, functionName: "execute", args: [V4_SWAP, [input], deadline] });
  return { to: UNIVERSAL_ROUTER, data, value: zeroForOne ? amountIn : 0n };
}
