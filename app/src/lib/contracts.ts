import { type Address, parseAbi } from "viem";
import {
  commodityRegistryAbi,
  pushPriceOracleAbi,
  marketLicenseNFTAbi,
  liquidityPoolAbi,
  feeManagerAbi,
  perpEngineAbi,
} from "./abis";

function addr(env: string | undefined, fallback: string): Address {
  return (env ?? fallback) as Address;
}

// Defaults are the live Robinhood testnet (chain 46630) deployment.
// Mainnet (chain 4663). Registry + Oracle survived the 2026-08-13 license-NFT cascade redeploy;
// FeeManager / LicenseNFT / Pool / Engine are the new post-cascade addresses.
export const REGISTRY_ADDRESS = addr(
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
  "0xB56AB31fb1F1559c435A72B5Fd3c7E63baea3D96"
);
export const ORACLE_ADDRESS = addr(
  process.env.NEXT_PUBLIC_ORACLE_ADDRESS,
  "0x43F4B3E880437De908f418B199daE8F326F0F41A"
);
export const FEE_MANAGER_ADDRESS = addr(
  process.env.NEXT_PUBLIC_FEE_MANAGER_ADDRESS,
  "0x7B855d15B55a94F76DCE93EeD7fD6bA2eE4bb247"
);
export const LICENSE_NFT_ADDRESS = addr(
  process.env.NEXT_PUBLIC_LICENSE_NFT_ADDRESS,
  "0x1298D8591E5F5d53C15c46D25C6f0304F90D5FB1"
);
export const POOL_ADDRESS = addr(
  process.env.NEXT_PUBLIC_POOL_ADDRESS,
  "0x67f707191497CEe11886BcD2cC23208367b7AFA5"
);
export const ENGINE_ADDRESS = addr(
  process.env.NEXT_PUBLIC_ENGINE_ADDRESS,
  "0x343635C6602169993DA969A1E813093ba19A074a"
);
// LicenseMarketplace (secondary market for license NFTs), mainnet 4663. Deployed 2026-08-14.
export const MARKETPLACE_ADDRESS = addr(
  process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS,
  "0xbE50c0003a60726385d517a9188E51e5FD444ef7"
);

// Block the marketplace was deployed at (for bounded getLogs on its events).
export const MARKETPLACE_DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_MARKETPLACE_DEPLOY_BLOCK ?? "36452414"
);

// PredictionMarket (parimutuel, oracle-resolved commodity-price binaries), mainnet 4663.
// Deployed 2026-08-16. Testnet (46630) address: 0xB58c33F560deED608ae7Aef3E7Ebf931Ff4e6924.
export const PREDICTION_MARKET_ADDRESS = addr(
  process.env.NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS,
  "0xF8Ba8D3F862E6C0fC002e371a08dA9f8119C6482"
);

// Block the PredictionMarket was deployed at (for bounded getLogs on its events).
export const PREDICTION_DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_PREDICTION_DEPLOY_BLOCK ?? "37626861"
);

export const predictionMarketAbi = parseAbi([
  "function marketCount() view returns (uint256)",
  "function getMarket(uint256 marketId) view returns ((uint256 commodityId, uint256 thresholdE8, uint64 expiry, bool isAbove, uint8 status, bool outcomeYes, uint256 yesPool, uint256 noPool, uint256 winnerPool, uint256 netLosingPool, uint256 resolvedPrice, address creator))",
  "function odds(uint256 marketId) view returns (uint256 yesBps, uint256 noBps)",
  "function claimable(uint256 marketId, address bettor) view returns (uint256)",
  "function yesStake(uint256 marketId, address bettor) view returns (uint256)",
  "function noStake(uint256 marketId, address bettor) view returns (uint256)",
  "function claimed(uint256 marketId, address bettor) view returns (bool)",
  "function proceeds(address account) view returns (uint256)",
  "function feeBps() view returns (uint96)",
  "function minBet() view returns (uint256)",
  "function minDuration() view returns (uint64)",
  "function resolveGracePeriod() view returns (uint64)",
  "function permissionlessCreation() view returns (bool)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
  "function bet(uint256 marketId, bool isYes) payable",
  "function resolve(uint256 marketId)",
  "function cancel(uint256 marketId)",
  "function claim(uint256 marketId) returns (uint256)",
  "function withdrawProceeds() returns (uint256)",
  "function createMarket(uint256 commodityId, uint256 thresholdE8, uint64 expiry, bool isAbove) returns (uint256)",
  "event MarketCreated(uint256 indexed marketId, uint256 indexed commodityId, address indexed creator, uint256 thresholdE8, uint64 expiry, bool isAbove)",
  "event BetPlaced(uint256 indexed marketId, address indexed bettor, bool isYes, uint256 amount)",
  "event MarketResolved(uint256 indexed marketId, bool outcomeYes, uint256 price, uint256 fee)",
  "event MarketCancelled(uint256 indexed marketId)",
  "event Claimed(uint256 indexed marketId, address indexed bettor, uint256 amount)",
]);

export const licenseMarketplaceAbi = parseAbi([
  "function list(uint256 tokenId, uint256 price)",
  "function updatePrice(uint256 tokenId, uint256 newPrice)",
  "function cancel(uint256 tokenId)",
  "function delistStale(uint256 tokenId)",
  "function buy(uint256 tokenId) payable",
  "function withdrawProceeds() returns (uint256)",
  "function getListing(uint256 tokenId) view returns (address seller, uint256 price)",
  "function isListed(uint256 tokenId) view returns (bool)",
  "function proceeds(address account) view returns (uint256)",
  "function feeBps() view returns (uint96)",
  "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
  "event PriceUpdated(uint256 indexed tokenId, address indexed seller, uint256 price)",
  "event Cancelled(uint256 indexed tokenId, address indexed seller)",
  "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee)",
]);

// Fallback only: the UI reads mintPrice() live from the NFT contract. Keep in sync with the
// launch price so the button label is right before the read resolves. Owner can change it on-chain.
export const MINT_PRICE_WEI = 2_000_000_000_000_000n; // 0.002 ETH
export const PRICE_DECIMALS = 8; // oracle prices are USD * 1e8

// Block the contracts were deployed at (for bounded getLogs when enumerating positions).
export const DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "97312826"
);

export {
  commodityRegistryAbi,
  pushPriceOracleAbi,
  marketLicenseNFTAbi,
  liquidityPoolAbi,
  feeManagerAbi,
  perpEngineAbi,
};
