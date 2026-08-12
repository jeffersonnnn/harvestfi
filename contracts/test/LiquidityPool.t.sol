// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";

/// @dev This test contract plays the role of the perp engine, so it implements `lockedForPnl()`.
contract LiquidityPoolTest is Test {
    LiquidityPool internal pool;
    uint256 internal locked; // reported to the pool as reserved-for-PnL

    address internal lp1 = makeAddr("lp1");
    address internal lp2 = makeAddr("lp2");
    address internal trader = makeAddr("trader");

    function lockedForPnl() external view returns (uint256) {
        return locked;
    }

    receive() external payable {}

    function setUp() public {
        pool = new LiquidityPool(address(this));
        pool.setPerpEngine(address(this));
        vm.deal(lp1, 100 ether);
        vm.deal(lp2, 100 ether);
        vm.deal(address(this), 100 ether);
    }

    function test_depositMintsProportionalShares() public {
        vm.prank(lp1);
        uint256 s1 = pool.deposit{value: 10 ether}();
        assertEq(s1, 10 ether - 1000); // first deposit 1:1 minus locked MINIMUM_LIQUIDITY
        assertEq(pool.totalShares(), 10 ether); // depositor shares + 1000 dead shares

        vm.prank(lp2);
        uint256 s2 = pool.deposit{value: 30 ether}();
        assertEq(s2, 30 ether); // price still 1.0
        assertEq(pool.totalAssets(), 40 ether);
    }

    function test_lossRaisesSharePrice_profitLowers() public {
        vm.prank(lp1);
        pool.deposit{value: 10 ether}();

        // Trader loses 2 ether into the pool.
        pool.receiveLoss{value: 2 ether}();
        assertEq(pool.totalAssets(), 12 ether);
        assertEq(pool.sharePriceE18(), 1.2e18);

        // Pool pays 4 ether of profit out.
        pool.payTraderProfit(trader, 4 ether);
        assertEq(pool.totalAssets(), 8 ether);
        assertEq(pool.sharePriceE18(), 0.8e18);
    }

    function test_withdrawPaysProRata() public {
        vm.prank(lp1);
        pool.deposit{value: 10 ether}();
        pool.receiveLoss{value: 2 ether}(); // share price now 1.2

        uint256 before = lp1.balance;
        vm.prank(lp1);
        uint256 out = pool.withdraw(5 ether); // 5 shares * 1.2 = 6 ether
        assertEq(out, 6 ether);
        assertEq(lp1.balance - before, 6 ether);
    }

    function test_revert_withdrawBeyondUtilization() public {
        vm.prank(lp1);
        pool.deposit{value: 10 ether}();
        locked = 8 ether; // engine reserves 8 ether to back open positions

        vm.prank(lp1);
        vm.expectRevert("utilization");
        pool.withdraw(5 ether); // would leave 5 ether < 8 ether locked
    }

    function test_revert_payProfit_notEngine() public {
        vm.prank(address(0xBAD));
        vm.expectRevert("only perp");
        pool.payTraderProfit(trader, 1 ether);
    }

    function test_revert_receiveLoss_notEngine() public {
        vm.deal(address(0xBAD), 1 ether);
        vm.prank(address(0xBAD));
        vm.expectRevert("only perp");
        pool.receiveLoss{value: 1 ether}();
    }

    function test_revert_setPerpEngine_twice() public {
        vm.expectRevert("perp set");
        pool.setPerpEngine(address(0x1234));
    }
}
