import {
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  encodeAbiParameters,
  encodeFunctionData,
  decodeAbiParameters,
  parseAbi,
  toHex,
} from "viem";

// pools.trade launch stack + HarvestFi LaunchRegistry on Robinhood Chain (4663). See LAUNCHPAD-PHASE0.md.
export const LAUNCHER = "0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0" as Address; // LiquidityLauncher (multicall)
export const FACTORY = "0x000000e200088D55C39a11F609E5F667729ad49b" as Address; // UERC20Factory
export const STRATEGY = "0x23f8209572b4a1C2AD88A42749E830791Fb027f1" as Address; // creator-fee InstantLaunch strategy
export const BENEFICIARY_VAULT = "0xd35E9CA72F64C7F93BE30fad67524323396B36D7" as Address; // fee-claim vault

// Deployed on mainnet 4663 (2026-08-14). Env overrides the default.
export const LAUNCH_REGISTRY = (process.env.NEXT_PUBLIC_LAUNCH_REGISTRY_ADDRESS ??
  "0x59a277ce4Df70540fe06A193c4810e09Be8fe0e7") as Address;

export const TOKEN_SUPPLY = 1_000_000_000n * 10n ** 18n; // 1B, fixed by pools.trade
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const launcherAbi = parseAbi([
  "function createToken(address factory, string name, string symbol, uint8 decimals, uint128 initialSupply, address recipient, bytes tokenData) returns (address)",
  "function distributeToken(address token, (address strategy, uint128 amount, bytes configData) distribution, bytes32 salt)",
  "function multicall(bytes[] data) returns (bytes[] results)",
]);

export const beneficiaryVaultAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function claim(uint256 tokenId, uint256 minCurrency0Amount, uint256 minCurrency1Amount)",
]);

export const launchRegistryAbi = parseAbi([
  "function register(address token, uint256 marketId, uint256 positionId) returns (uint256)",
  "function launchCount() view returns (uint256)",
  "function isRegistered(address token) view returns (bool)",
  "function getLaunch(uint256 i) view returns ((address token, uint256 marketId, uint256 positionId, address creator, uint64 timestamp))",
  "function recentLaunches(uint256 offset, uint256 limit) view returns ((address token, uint256 marketId, uint256 positionId, address creator, uint64 timestamp)[])",
  "function launchesForMarket(uint256 marketId) view returns (uint256[])",
  "event HarvestFiLaunch(address indexed token, uint256 indexed marketId, uint256 positionId, address indexed creator, uint256 index)",
]);

export type CoinMeta = {
  description?: string;
  website?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
};

// The token's metadata() getter is (string description, string website, string image, bytes extraData).
// We pack twitter/telegram into extraData in our own format (see decodeSocials).
const TOKEN_META_TUPLE = [
  {
    type: "tuple",
    components: [
      { name: "description", type: "string" },
      { name: "website", type: "string" },
      { name: "image", type: "string" },
      { name: "extraData", type: "bytes" },
    ],
  },
] as const;

export function encodeExtraData(twitter?: string, telegram?: string): Hex {
  if (!twitter && !telegram) return "0x";
  return encodeAbiParameters([{ type: "string" }, { type: "string" }], [twitter ?? "", telegram ?? ""]);
}

/** Encodes the token metadata so metadata() returns it correctly (image in slot 3, not extraData). */
export function encodeTokenData(meta: CoinMeta): Hex {
  return encodeAbiParameters(TOKEN_META_TUPLE, [
    {
      description: meta.description ?? "",
      website: meta.website ?? "",
      image: meta.image ?? "",
      extraData: encodeExtraData(meta.twitter, meta.telegram),
    },
  ]);
}

export const uerc20MetadataAbi = parseAbi([
  "function metadata() view returns (string description, string website, string image, bytes extraData)",
]);

export function decodeSocials(extraData?: Hex): { twitter?: string; telegram?: string } {
  if (!extraData || extraData === "0x") return {};
  try {
    const [twitter, telegram] = decodeAbiParameters([{ type: "string" }, { type: "string" }], extraData);
    return { twitter: twitter || undefined, telegram: telegram || undefined };
  } catch {
    return {};
  }
}

/** configData = the fee beneficiary address (creator-fee mode). */
export function encodeConfigData(feeBeneficiary: Address): Hex {
  return encodeAbiParameters([{ type: "address" }], [feeBeneficiary]);
}

export function buildCreateToken(name: string, symbol: string, tokenData: Hex): Hex {
  return encodeFunctionData({
    abi: launcherAbi,
    functionName: "createToken",
    args: [FACTORY, name, symbol, 18, TOKEN_SUPPLY, LAUNCHER, tokenData],
  });
}

export function buildDistributeToken(token: Address, configData: Hex, salt: Hex): Hex {
  return encodeFunctionData({
    abi: launcherAbi,
    functionName: "distributeToken",
    args: [token, { strategy: STRATEGY, amount: TOKEN_SUPPLY, configData }, salt],
  });
}

export function buildLaunchMulticall(createTokenData: Hex, distributeData: Hex): Hex {
  return encodeFunctionData({
    abi: launcherAbi,
    functionName: "multicall",
    args: [[createTokenData, distributeData]],
  });
}

export function randomSalt(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return toHex(b);
}

/**
 * Predict the CREATE2 token address by simulating multicall([createToken]) from the account.
 * The launch mechanic makes createToken deterministic for a given (sender, name, symbol).
 */
export async function predictTokenAddress(
  publicClient: PublicClient,
  account: Address,
  createTokenData: Hex
): Promise<Address> {
  const data = encodeFunctionData({ abi: launcherAbi, functionName: "multicall", args: [[createTokenData]] });
  const res = await publicClient.call({ to: LAUNCHER, data, account });
  if (!res.data) throw new Error("prediction returned no data");
  const [results] = decodeAbiParameters([{ type: "bytes[]" }], res.data) as [Hex[]];
  const [token] = decodeAbiParameters([{ type: "address" }], results[0]) as [Address];
  return token;
}

/** Pull the beneficiary NFT id (== positionId) minted to `feeBeneficiary` from the launch receipt. */
export function positionIdFromReceipt(receipt: TransactionReceipt, feeBeneficiary: Address): bigint | undefined {
  const vault = BENEFICIARY_VAULT.toLowerCase();
  const to = feeBeneficiary.toLowerCase();
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === vault &&
      log.topics.length === 4 &&
      log.topics[0]?.toLowerCase() === TRANSFER_TOPIC
    ) {
      const from = BigInt(log.topics[1] as Hex);
      const dest = ("0x" + (log.topics[2] as string).slice(26)).toLowerCase();
      if (from === 0n && dest === to) return BigInt(log.topics[3] as Hex);
    }
  }
  return undefined;
}

export function hasRegistry(): boolean {
  return LAUNCH_REGISTRY !== "0x0000000000000000000000000000000000000000";
}

// IPFS gateway for displaying pinned images. Override with NEXT_PUBLIC_PINATA_GATEWAY.
export const IPFS_GATEWAY = (process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud").replace(
  /\/$/,
  ""
);

export function ipfsToHttp(uri?: string): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith("ipfs://")) return `${IPFS_GATEWAY}/ipfs/${uri.slice(7)}`;
  return uri;
}
