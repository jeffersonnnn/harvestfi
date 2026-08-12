import {encodeAbiParameters, keccak256, type Address, type Hex} from "viem";
import {type PrivateKeyAccount} from "viem/accounts";

/// Inner hash that PushPriceOracle.priceDigest hashes before applying the EIP-191 prefix:
///   keccak256(abi.encode(chainId, oracle, id, price(int256), timestamp(uint64)))
/// Field order and types MUST match the Solidity contract exactly.
export function priceInnerHash(
    chainId: number,
    oracle: Address,
    id: bigint,
    priceE8: bigint,
    timestamp: bigint,
): Hex {
    const encoded = encodeAbiParameters(
        [{type: "uint256"}, {type: "address"}, {type: "uint256"}, {type: "int256"}, {type: "uint64"}],
        [BigInt(chainId), oracle, id, priceE8, timestamp],
    );
    return keccak256(encoded);
}

/// Sign the inner hash with the EIP-191 personal-sign prefix. This is exactly what the contract's
/// `MessageHashUtils.toEthSignedMessageHash(innerHash)` + `ECDSA.recover(...)` verifies against, so
/// `signMessage({ message: { raw: innerHash } })` produces a signature the oracle accepts.
export async function signPrice(
    account: PrivateKeyAccount,
    chainId: number,
    oracle: Address,
    id: bigint,
    priceE8: bigint,
    timestamp: bigint,
): Promise<Hex> {
    const hash = priceInnerHash(chainId, oracle, id, priceE8, timestamp);
    return account.signMessage({message: {raw: hash}});
}
