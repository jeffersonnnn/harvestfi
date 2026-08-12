// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./helpers/Base.sol";
import {PerpEngine} from "../src/PerpEngine.sol";

contract PerpEngineTest is Base {
    uint256 internal gold; // commodityId

    function setUp() public override {
        super.setUp();
        gold = _listDefault("GOLD", "Metals", 10, 500); // maxLev 10, maintenance 5%
        _post(gold, 2000e8);
        _fundPool(500 ether);
    }

    function test_openChargesFeeAndReservesNotional() public {
        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, true, 5, 0);

        PerpEngine.Position memory pos = engine.getPosition(pid);
        assertEq(pos.trader, alice);
        assertEq(pos.sizeEth, 5 ether);
        assertEq(pos.collateral, 1 ether - 0.005 ether); // margin 1 ETH minus openFee (5e18 * 10bps)
        assertEq(pos.entryPrice, 2000e8);
        assertEq(engine.globalOpenNotional(), 5 ether);
        // 70% of the 0.005 open fee to the holder bucket.
        assertEq(feeManager.commodityBucket(gold), 0.0035 ether);
    }

    function test_longProfit_paidFromPool() public {
        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, true, 5, 0);

        _post(gold, 2200e8); // +10%
        uint256 poolBefore = pool.totalAssets();

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        engine.closePosition(pid, 0);

        // PnL = 5e18 * 10% = 0.5 ether. collateral 0.995 + 0.5 - closeFee 0.005 => ~1.49.
        assertApproxEqAbs(alice.balance - aliceBefore, 1.49 ether, 1e12);
        // Pool paid out ~0.5 ether of profit.
        assertApproxEqAbs(poolBefore - pool.totalAssets(), 0.5 ether, 1e12);
    }

    function test_longLoss_goesToPool() public {
        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, true, 5, 0);

        _post(gold, 1900e8); // -5%
        uint256 poolBefore = pool.totalAssets();

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        engine.closePosition(pid, 0);

        // PnL = 5e18 * -5% = -0.25 ether. payout = 0.995 - 0.25 - closeFee ~= 0.74.
        assertApproxEqAbs(alice.balance - aliceBefore, 0.74 ether, 1e12);
        assertApproxEqAbs(pool.totalAssets() - poolBefore, 0.25 ether, 1e12);
    }

    function test_shortProfit_onPriceDrop() public {
        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, false, 5, 0);

        _post(gold, 1800e8); // -10% => short gains 0.5 ether

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        engine.closePosition(pid, 0);
        assertApproxEqAbs(alice.balance - aliceBefore, 1.49 ether, 1e12);
    }

    function test_liquidation_rewardsCaller() public {
        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, true, 10, 0); // notional 10, maintenance 0.5

        assertFalse(engine.isLiquidatable(pid));
        _post(gold, 1880e8); // -6% => pnl -0.6, equity 0.4 < 0.5 maintenance
        assertTrue(engine.isLiquidatable(pid));

        uint256 keeperBefore = keeper.balance;
        vm.prank(keeper);
        engine.liquidate(pid);

        assertGt(keeper.balance, keeperBefore); // liquidator rewarded
        assertEq(engine.getPosition(pid).trader, address(0)); // position closed
        assertEq(engine.globalOpenNotional(), 0);
    }

    function test_revert_liquidateHealthy() public {
        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, true, 5, 0);
        _post(gold, 2010e8); // slightly up, healthy
        vm.prank(keeper);
        vm.expectRevert("healthy");
        engine.liquidate(pid);
    }

    function test_revert_openBadLeverage() public {
        vm.prank(alice);
        vm.expectRevert("bad leverage");
        engine.openPosition{value: 1 ether}(gold, true, 11, 0); // exceeds maxLev 10
    }

    function test_revert_openSlippage() public {
        vm.prank(alice);
        vm.expectRevert("slippage");
        engine.openPosition{value: 1 ether}(gold, true, 5, 1999e8); // long requires price <= bound
    }

    function test_revert_openStalePrice() public {
        vm.warp(block.timestamp + MAX_AGE + 1);
        vm.prank(alice);
        vm.expectRevert("stale price");
        engine.openPosition{value: 1 ether}(gold, true, 5, 0);
    }

    function test_revert_closeNotOwner() public {
        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, true, 5, 0);
        vm.prank(bob);
        vm.expectRevert("not owner");
        engine.closePosition(pid, 0);
    }

    function test_fundingAccrues_longsPayShorts() public {
        // Long-heavy skew: alice long 10, bob short 2.
        vm.prank(alice);
        uint256 pl = engine.openPosition{value: 2 ether}(gold, true, 5, 0); // notional 10
        vm.prank(bob);
        engine.openPosition{value: 1 ether}(gold, false, 2, 0); // notional 2

        int256 pnlBefore = engine.unrealizedPnl(pl);
        vm.warp(block.timestamp + 1 days);
        _post(gold, 2000e8); // same price, only funding changes
        engine.pokeFunding(gold); // advance the funding index to now
        int256 pnlAfter = engine.unrealizedPnl(pl);

        // Price unchanged, but the long paid funding => its PnL dropped.
        assertLt(pnlAfter, pnlBefore);
    }

    function test_borrowFee_heavierSidePaysToPool() public {
        engine.setFundingFactorPerDay(0); // isolate the borrow fee from funding

        // Long-only market => longs are the heavier side and pay the borrow fee.
        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 2 ether}(gold, true, 5, 0); // notional 10
        assertEq(engine.pendingBorrowFee(pid), 0);

        uint256 poolBefore = pool.totalAssets();
        vm.warp(block.timestamp + 30 days);
        _post(gold, 2000e8); // price unchanged
        engine.pokeFunding(gold); // advance indices

        uint256 fee = engine.pendingBorrowFee(pid);
        assertGt(fee, 0);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        engine.closePosition(pid, 0);

        // Price flat + no funding => the only costs are the borrow fee (to pool) and close fee (to FeeManager).
        // Pool grew by ~the borrow fee.
        assertApproxEqAbs(pool.totalAssets() - poolBefore, fee, 1e12);
        // Trader received collateral minus borrow fee minus close fee (strictly less than collateral).
        assertLt(alice.balance - aliceBefore, 2 ether);
    }

    function test_lighterSidePaysNoBorrowFee() public {
        engine.setFundingFactorPerDay(0);

        // Make shorts the heavier side, then open a small long (the lighter side).
        vm.prank(bob);
        engine.openPosition{value: 4 ether}(gold, false, 5, 0); // short notional 20 (heavier)
        vm.prank(alice);
        uint256 longPid = engine.openPosition{value: 1 ether}(gold, true, 5, 0); // long notional 5 (lighter)

        vm.warp(block.timestamp + 30 days);
        _post(gold, 2000e8);
        engine.pokeFunding(gold);

        // The long is on the lighter side => its borrow index never advanced.
        assertEq(engine.pendingBorrowFee(longPid), 0);
    }

    function test_revert_insufficientPool() public {
        // Drain most of the pool by having lp withdraw, then require large notional.
        uint256 shares = pool.shares(lp);
        vm.prank(lp);
        pool.withdraw(shares - 1 ether > 0 ? shares - (shares * 999 / 1000) : shares); // leave ~little
        // Try to open notional larger than pool assets.
        vm.deal(alice, 1000 ether);
        vm.prank(alice);
        vm.expectRevert("insufficient pool");
        engine.openPosition{value: 200 ether}(gold, true, 10, 0); // notional 2000 > pool
    }
}
