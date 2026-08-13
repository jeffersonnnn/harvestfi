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

    // --- price-deviation circuit-breaker ---

    event PriceRejected(uint256 indexed id, int256 price, int256 lastPrice, uint64 timestamp);

    function test_deviation_disabledByDefault_allowsAnyJump() public {
        uint64 ts0 = uint64(block.timestamp);
        _post(1, 100e8, ts0, signerPk);
        uint64 ts1 = ts0 + 60;
        vm.warp(ts1);
        _post(1, 500e8, ts1, signerPk); // 5x jump, guard disabled (0)
        assertEq(oracle.getFreshPrice(1), 500e8);
    }

    function test_deviation_withinBand_accepted() public {
        oracle.setMaxDeviation(1000); // 10%
        uint64 ts0 = uint64(block.timestamp);
        _post(1, 100e8, ts0, signerPk);
        uint64 ts1 = ts0 + 60;
        vm.warp(ts1);
        _post(1, 105e8, ts1, signerPk); // +5%, within band
        assertEq(oracle.getFreshPrice(1), 105e8);
    }

    function test_deviation_beyondBand_dropped() public {
        oracle.setMaxDeviation(1000); // 10%
        vm.warp(2_000_000);
        _post(1, 100e8, 2_000_000, signerPk);
        vm.warp(2_000_060);

        vm.expectEmit(true, false, false, true);
        emit PriceRejected(1, 130e8, 100e8, 2_000_060);
        _post(1, 130e8, 2_000_060, signerPk); // +30%, dropped (no revert)

        // Price and timestamp are unchanged - the outlier never landed.
        (int256 p, uint64 t) = oracle.getPrice(1);
        assertEq(p, 100e8);
        assertEq(t, 2_000_000);
    }

    function test_deviation_firstPriceAlwaysAccepted() public {
        oracle.setMaxDeviation(1000);
        uint64 ts = uint64(block.timestamp);
        _post(9, 4000e8, ts, signerPk); // no prior price => band does not apply
        assertEq(oracle.getFreshPrice(9), 4000e8);
    }

    function test_deviation_oneBadMarketDoesNotBlockBatch() public {
        oracle.setMaxDeviation(1000); // 10%
        uint64 ts = uint64(block.timestamp);
        _post(1, 100e8, ts, signerPk);
        _post(2, 100e8, ts, signerPk);
        vm.warp(block.timestamp + 60);
        uint64 ts1 = uint64(block.timestamp);

        uint256[] memory ids = new uint256[](2);
        int256[] memory prices = new int256[](2);
        uint64[] memory tss = new uint64[](2);
        bytes[] memory sigs = new bytes[](2);
        ids[0] = 1;
        ids[1] = 2;
        prices[0] = 105e8; // +5%, in band
        prices[1] = 130e8; // +30%, out of band
        tss[0] = ts1;
        tss[1] = ts1;
        sigs[0] = _signPrice(oracle, signerPk, 1, prices[0], ts1);
        sigs[1] = _signPrice(oracle, signerPk, 2, prices[1], ts1);

        oracle.postPrices(ids, prices, tss, sigs); // must NOT revert

        assertEq(oracle.getFreshPrice(1), 105e8); // good market updated
        assertEq(oracle.getFreshPrice(2), 100e8); // bad market kept its last price
    }

    function test_revert_setMaxDeviation_notOwner() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        oracle.setMaxDeviation(500);
    }
}
