// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IPushPriceOracle} from "./interfaces/IPushPriceOracle.sol";

/// @title PushPriceOracle
/// @notice Signed push oracle. An off-chain keeper pulls commodity prices, normalizes them to
///         USD scaled by 1e8, signs (chainId, oracle, commodityId, price, timestamp), and posts
///         them here. The contract verifies the ECDSA signature against a trusted signer and
///         enforces monotonic, non-future, non-stale timestamps.
///
///         NORMALIZATION (keeper responsibility — see KEEPER.md): the source (Trading Economics)
///         quotes commodities in heterogeneous units and currencies. Grains/softs are in US CENTS
///         ("USd", e.g. Corn 441.71 USd/Bu => $4.4171), metals in USD, and others in EUR/GBp/MYR/
///         INR/BRL/NOK/CAD/AUD. The keeper MUST convert cents->dollars and apply FX to USD BEFORE
///         signing, so this contract only ever stores a consistent 1e8-USD value per listed unit.
contract PushPriceOracle is IPushPriceOracle, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    uint8 public constant DECIMALS = 8; // prices are USD * 1e8

    struct Price {
        int256 price;
        uint64 timestamp;
    }

    mapping(uint256 => Price) private _prices;
    address public trustedSigner;
    uint64 public maxPriceAge;
    uint256 public maxDeviationBps; // circuit-breaker band vs the last price; 0 = disabled

    event SignerUpdated(address indexed signer);
    event MaxPriceAgeUpdated(uint64 maxPriceAge);
    event MaxDeviationUpdated(uint256 bps);
    event PricePosted(uint256 indexed id, int256 price, uint64 timestamp);
    event PriceRejected(uint256 indexed id, int256 price, int256 lastPrice, uint64 timestamp);

    constructor(address initialOwner, address signer_, uint64 maxPriceAge_) Ownable(initialOwner) {
        require(signer_ != address(0), "signer=0");
        require(maxPriceAge_ > 0, "age=0");
        trustedSigner = signer_;
        maxPriceAge = maxPriceAge_;
    }

    function setSigner(address signer_) external onlyOwner {
        require(signer_ != address(0), "signer=0");
        trustedSigner = signer_;
        emit SignerUpdated(signer_);
    }

    function setMaxPriceAge(uint64 maxPriceAge_) external onlyOwner {
        require(maxPriceAge_ > 0, "age=0");
        maxPriceAge = maxPriceAge_;
        emit MaxPriceAgeUpdated(maxPriceAge_);
    }

    /// @notice Set the circuit-breaker band in bps (0 disables). A posted price that jumps more than
    ///         this from the last stored price for the same id is dropped, guarding against a
    ///         compromised signer or bad print pushing a wild value. See {postPrice}.
    function setMaxDeviation(uint256 bps) external onlyOwner {
        maxDeviationBps = bps;
        emit MaxDeviationUpdated(bps);
    }

    /// @notice Digest a keeper must sign for a given (id, price, timestamp).
    function priceDigest(uint256 id, int256 price, uint64 timestamp) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), id, price, timestamp)).toEthSignedMessageHash();
    }

    /// @notice Post a single signed price update.
    function postPrice(uint256 id, int256 price, uint64 timestamp, bytes calldata signature) public {
        require(price > 0, "price<=0");
        require(timestamp <= block.timestamp, "future ts");
        Price storage p = _prices[id];
        require(timestamp > p.timestamp, "stale/replay ts");

        address recovered = priceDigest(id, price, timestamp).recover(signature);
        require(recovered == trustedSigner, "bad signer");

        // Circuit-breaker: DROP (do not revert) a price that jumps more than maxDeviationBps from the
        // last stored one, so a compromised signer or bad print can't push a wild value that mass-
        // liquidates traders or drains the pool. A dropped market keeps its last price and ages out via
        // maxPriceAge (stale => trading disabled) until the feed is back in band or the owner widens
        // it. Skipping instead of reverting means one bad market can't block a whole postPrices batch.
        if (maxDeviationBps != 0 && p.price > 0) {
            uint256 last = uint256(p.price);
            uint256 diff = uint256(price) > last ? uint256(price) - last : last - uint256(price);
            if (diff * 10_000 > last * maxDeviationBps) {
                emit PriceRejected(id, price, p.price, timestamp);
                return;
            }
        }

        p.price = price;
        p.timestamp = timestamp;
        emit PricePosted(id, price, timestamp);
    }

    /// @notice Batch variant of {postPrice}.
    function postPrices(
        uint256[] calldata ids,
        int256[] calldata prices,
        uint64[] calldata timestamps,
        bytes[] calldata signatures
    ) external {
        uint256 n = ids.length;
        require(prices.length == n && timestamps.length == n && signatures.length == n, "length mismatch");
        for (uint256 i = 0; i < n; i++) {
            postPrice(ids[i], prices[i], timestamps[i], signatures[i]);
        }
    }

    function getPrice(uint256 id) external view returns (int256 price, uint64 timestamp) {
        Price storage p = _prices[id];
        return (p.price, p.timestamp);
    }

    function getFreshPrice(uint256 id) external view returns (uint256 price) {
        Price storage p = _prices[id];
        require(p.timestamp != 0, "no price");
        require(block.timestamp - p.timestamp <= maxPriceAge, "stale price");
        require(p.price > 0, "bad price");
        return uint256(p.price);
    }
}
