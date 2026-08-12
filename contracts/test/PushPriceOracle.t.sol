// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OracleSigner} from "./helpers/OracleSigner.sol";
import {PushPriceOracle} from "../src/PushPriceOracle.sol";

contract PushPriceOracleTest is OracleSigner {
    PushPriceOracle internal oracle;
    uint256 internal signerPk = 0xBEEF;
    address internal signer;
    uint64 internal constant MAX_AGE = 1 hours;

    function setUp() public {
        signer = vm.addr(signerPk);
        vm.warp(1_000_000);
        oracle = new PushPriceOracle(address(this), signer, MAX_AGE);
    }

    function _post(uint256 id, int256 price, uint64 ts, uint256 pk) internal {
        oracle.postPrice(id, price, ts, _signPrice(oracle, pk, id, price, ts));
    }

    // Sign first (a view call), so a following vm.expectRevert targets only postPrice.
    function _sig(uint256 id, int256 price, uint64 ts, uint256 pk) internal view returns (bytes memory) {
        return _signPrice(oracle, pk, id, price, ts);
    }

    function test_postAndRead() public {
        uint64 ts = uint64(block.timestamp);
        _post(1, 2000e8, ts, signerPk);

        (int256 p, uint64 t) = oracle.getPrice(1);
        assertEq(p, 2000e8);
        assertEq(t, ts);
        assertEq(oracle.getFreshPrice(1), 2000e8);
    }

    function test_batchPost() public {
        uint64 ts = uint64(block.timestamp);
        uint256[] memory ids = new uint256[](2);
        int256[] memory prices = new int256[](2);
        uint64[] memory tss = new uint64[](2);
        bytes[] memory sigs = new bytes[](2);
        ids[0] = 3;
        ids[1] = 7;
        prices[0] = 100e8;
        prices[1] = 4095_61000000; // e.g. gold-ish
        tss[0] = ts;
        tss[1] = ts;
        sigs[0] = _signPrice(oracle, signerPk, 3, prices[0], ts);
        sigs[1] = _signPrice(oracle, signerPk, 7, prices[1], ts);

        oracle.postPrices(ids, prices, tss, sigs);
        assertEq(oracle.getFreshPrice(3), 100e8);
        assertEq(oracle.getFreshPrice(7), uint256(prices[1]));
    }

    function test_revert_wrongSigner() public {
        uint64 ts = uint64(block.timestamp);
        bytes memory sig = _sig(1, 2000e8, ts, 0xDEAD); // signed by a non-trusted key
        vm.expectRevert("bad signer");
        oracle.postPrice(1, 2000e8, ts, sig);
    }

    function test_revert_futureTimestamp() public {
        uint64 ts = uint64(block.timestamp + 1);
        bytes memory sig = _sig(1, 2000e8, ts, signerPk);
        vm.expectRevert("future ts");
        oracle.postPrice(1, 2000e8, ts, sig);
    }

    function test_revert_replayOrStaleTimestamp() public {
        uint64 ts = uint64(block.timestamp);
        _post(1, 2000e8, ts, signerPk);

        // same timestamp again
        bytes memory sameSig = _sig(1, 2100e8, ts, signerPk);
        vm.expectRevert("stale/replay ts");
        oracle.postPrice(1, 2100e8, ts, sameSig);

        // older timestamp
        bytes memory oldSig = _sig(1, 2100e8, ts - 1, signerPk);
        vm.expectRevert("stale/replay ts");
        oracle.postPrice(1, 2100e8, ts - 1, oldSig);
    }

    function test_revert_nonPositivePrice() public {
        uint64 ts = uint64(block.timestamp);
        bytes memory sig = _sig(1, 0, ts, signerPk);
        vm.expectRevert("price<=0");
        oracle.postPrice(1, 0, ts, sig);
    }

    function test_revert_getFreshPrice_stale() public {
        uint64 ts = uint64(block.timestamp);
        _post(1, 2000e8, ts, signerPk);
        vm.warp(block.timestamp + MAX_AGE + 1);
        vm.expectRevert("stale price");
        oracle.getFreshPrice(1);
    }

    function test_revert_getFreshPrice_missing() public {
        vm.expectRevert("no price");
        oracle.getFreshPrice(999);
    }

    function test_setSigner() public {
        uint256 newPk = 0xC0FFEE;
        oracle.setSigner(vm.addr(newPk));
        uint64 ts = uint64(block.timestamp);
        _post(1, 1234e8, ts, newPk);
        assertEq(oracle.getFreshPrice(1), 1234e8);
    }

    function test_revert_setSigner_notOwner() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        oracle.setSigner(address(0x1234));
    }
}
