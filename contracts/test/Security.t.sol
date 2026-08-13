// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./helpers/Base.sol";
import {PerpEngine} from "../src/PerpEngine.sol";
import {LiquidityPool} from "../src/LiquidityPool.sol";

/// A trader contract that rejects ETH - used to prove it cannot block its own liquidation.
contract RevertingTrader {
    function open(PerpEngine e, uint256 id, bool isLong, uint16 lev) external payable returns (uint256) {
        return e.openPosition{value: msg.value}(id, isLong, lev, 0);
    }

    receive() external payable {
        revert("no ETH");
    }
}

contract SecurityTest is Base {
    uint256 internal gold;

    function setUp() public override {
        super.setUp();
        gold = _listDefault("GOLD", "Metals", 20, 500);
        _post(gold, 2000e8);
        _fundPool(500 ether);
    }

    /// HIGH regression: a trader whose receive() reverts must not be able to block liquidation.
    function test_liquidationNotBlockedByRevertingTrader() public {
        RevertingTrader rt = new RevertingTrader();
        vm.deal(address(this), 10 ether);
        uint256 pid = rt.open{value: 1 ether}(engine, gold, true, 10); // notional 10, collateral 0.99

        _post(gold, 1880e8); // -6% => liquidatable but solvent (payout > 0)
        assertTrue(engine.isLiquidatable(pid));

        uint256 keeperBefore = keeper.balance;
        vm.prank(keeper);
        engine.liquidate(pid); // must NOT revert despite the reverting trader

        assertEq(engine.getPosition(pid).trader, address(0)); // position cleared
        assertGt(keeper.balance - keeperBefore, 0); // liquidator paid
        assertGt(engine.owed(address(rt)), 0); // trader residual escrowed for pull, not lost/blocking

        // The trader can later pull it (from a non-reverting path) - here just confirm the balance exists.
        assertApproxEqAbs(engine.owed(address(rt)), 0.33 ether, 0.05 ether);
    }

    /// MEDIUM regression: first deposit must exceed the locked minimum, and dead shares are burned.
    function test_minLiquidityLocked() public {
        LiquidityPool p = new LiquidityPool(address(this));
        p.setPerpEngine(address(engine));

        vm.expectRevert("min liquidity");
        p.deposit{value: 1000}(); // == MINIMUM_LIQUIDITY, not strictly greater

        uint256 out = p.deposit{value: 1 ether}();
        assertEq(out, 1 ether - 1000);
        assertEq(p.shares(0x000000000000000000000000000000000000dEaD), 1000);
        assertEq(p.totalShares(), 1 ether);
    }

    /// A second depositor still receives a fair, non-zero share after a donation (inflation resistance).
    function test_secondDepositorNotZeroedByDonation() public {
        LiquidityPool p = new LiquidityPool(address(this));
        p.setPerpEngine(address(engine));

        p.deposit{value: 1 ether}(); // first depositor (this)

        // Simulate a force-donation inflating the balance.
        vm.deal(address(p), address(p).balance + 50 ether);

        address lp2 = makeAddr("lp2");
        vm.deal(lp2, 10 ether);
        vm.prank(lp2);
        uint256 out = p.deposit{value: 10 ether}();
        assertGt(out, 0); // not rounded to zero
    }
}
