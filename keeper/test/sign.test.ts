import {test} from "node:test";
import assert from "node:assert/strict";
import {recoverMessageAddress, type Address} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {priceInnerHash, signPrice} from "../src/sign.js";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const ORACLE = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;

test("signature recovers to the signer (EIP-191 personal-sign of the inner hash)", async () => {
    const account = privateKeyToAccount(PK);
    const chainId = 4663;
    const id = 6n; // CORN
    const priceE8 = 441711600n;
    const ts = 1_700_000_000n;

    const sig = await signPrice(account, chainId, ORACLE, id, priceE8, ts);
    const recovered = await recoverMessageAddress({
        message: {raw: priceInnerHash(chainId, ORACLE, id, priceE8, ts)},
        signature: sig,
    });
    assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
});

test("inner hash is deterministic and binds every field", () => {
    const base = priceInnerHash(4663, ORACLE, 6n, 441711600n, 1_700_000_000n);
    assert.equal(base, priceInnerHash(4663, ORACLE, 6n, 441711600n, 1_700_000_000n));
    // Changing any field changes the digest.
    assert.notEqual(base, priceInnerHash(4664, ORACLE, 6n, 441711600n, 1_700_000_000n));
    assert.notEqual(base, priceInnerHash(4663, ORACLE, 7n, 441711600n, 1_700_000_000n));
    assert.notEqual(base, priceInnerHash(4663, ORACLE, 6n, 441711601n, 1_700_000_000n));
    assert.notEqual(base, priceInnerHash(4663, ORACLE, 6n, 441711600n, 1_700_000_001n));
});
