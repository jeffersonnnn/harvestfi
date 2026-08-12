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
export const REGISTRY_ADDRESS = addr(
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
  "0xFc7e57695D3b44393Ed007e45527e1eaB9Df58D6"
);
export const ORACLE_ADDRESS = addr(
  process.env.NEXT_PUBLIC_ORACLE_ADDRESS,
  "0xd3Fa9008eC7511f3d32A1760C3Ea52c58111f140"
);
export const FEE_MANAGER_ADDRESS = addr(
  process.env.NEXT_PUBLIC_FEE_MANAGER_ADDRESS,
  "0x6427fED9Cb4f047cf871b0E4766Aa40b8aCCF101"
);
export const LICENSE_NFT_ADDRESS = addr(
  process.env.NEXT_PUBLIC_LICENSE_NFT_ADDRESS,
  "0x0010e3982A36ACCB09d4EdEf49aCaC9D28E96061"
);
export const POOL_ADDRESS = addr(
  process.env.NEXT_PUBLIC_POOL_ADDRESS,
  "0x254a4628D985900402942F3a78Adf7F7BB8CddB1"
);
export const ENGINE_ADDRESS = addr(
  process.env.NEXT_PUBLIC_ENGINE_ADDRESS,
  "0x35B1fe02856BeECC4BC526c93670D988DE9d0343"
);

export const MINT_PRICE_WEI = 20_000_000_000_000_000n; // 0.02 ETH
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
