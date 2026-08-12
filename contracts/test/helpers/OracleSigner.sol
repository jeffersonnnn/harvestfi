// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PushPriceOracle} from "../../src/PushPriceOracle.sol";

/// @notice Test helper that produces valid keeper signatures for the push oracle.
abstract contract OracleSigner is Test {
    function _signPrice(PushPriceOracle oracle, uint256 pk, uint256 id, int256 price, uint64 ts)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = oracle.priceDigest(id, price, ts);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
