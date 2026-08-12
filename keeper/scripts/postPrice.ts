// One-off: post a single price (id, price1e8) using the keeper's real signing path.
// Usage: ORACLE_ADDRESS=.. RPC_URL=.. CHAIN_ID=.. PRIVATE_KEY=.. npx tsx scripts/postPrice.ts <id> <price1e8>
import {account, walletClient} from "../src/client.js";
import {config} from "../src/config.js";
import {pushPriceOracleAbi} from "../src/abis.js";
import {signPrice} from "../src/sign.js";

const id = BigInt(process.argv[2]);
const price = BigInt(process.argv[3]);
const ts = BigInt(Math.floor(Date.now() / 1000));

const sig = await signPrice(account, config.chainId, config.oracleAddress, id, price, ts);
const hash = await walletClient.writeContract({
    address: config.oracleAddress,
    abi: pushPriceOracleAbi,
    functionName: "postPrice",
    args: [id, price, ts, sig],
});
console.log(`posted id=${id} price=${price} ts=${ts} tx=${hash}`);
