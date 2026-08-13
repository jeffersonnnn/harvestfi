import { type Address } from "viem";
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
