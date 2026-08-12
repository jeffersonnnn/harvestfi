// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./helpers/Base.sol";

/// @notice D2 fix: liquidating an insolvent position still pays the liquidator (flat fee from
///         collateral), and the insurance fund tops up the LP pool so bad debt doesn't fall on LPs.
contract D2InsuranceTest is Base {
    uint256 internal gold;

    function setUp() public override {
        super.setUp();
        gold = _listDefault("GOLD", "Metals", 20, 300); // 20x, 3% maintenance
        _post(gold, 2000e8);
        _fundPool(500 ether);
        // Isolate PnL to pure price for exact arithmetic.
        engine.setFundingFactorPerDay(0);
        engine.setBorrowingFactorPerDay(0);
    }

    /// Open 20x (collateral 0.98 after 0.02 openFee), crash price 10% => trueLoss 2.0 >> collateral.
    function _openBadDebtLong() internal returns (uint256 pid) {
        vm.prank(alice);
        pid = engine.openPosition{value: 1 ether}(gold, true, 20, 0); // notional 20
        _post(gold, 1800e8); // -10% => pnl = -2.0 ETH
    }

    function test_liquidatorPaidEvenWhenInsolvent() public {
        uint256 pid = _openBadDebtLong();
        assertTrue(engine.isLiquidatable(pid));

        uint256 keeperBefore = keeper.balance;
        uint256 traderBefore = alice.balance;
        vm.prank(keeper);
        engine.liquidate(pid);

        // Liquidator earns the flat fee = 5% of collateral 0.98 = 0.049 (NOT zero as before D2).
        assertApproxEqAbs(keeper.balance - keeperBefore, 0.049 ether, 1e12);
        // Insolvent trader gets nothing back.
        assertEq(alice.balance, traderBefore);
    }

    function test_insuranceFundMakesPoolWhole() public {
        engine.depositInsurance{value: 5 ether}();
        assertEq(engine.insuranceFund(), 5 ether);

        uint256 pid = _openBadDebtLong();
        uint256 poolBefore = pool.totalAssets();

        vm.prank(keeper);
        engine.liquidate(pid);

        // Pool receives its full fair loss: fromCollateral 0.931 + insurance top-up 1.069 = 2.0.
        assertApproxEqAbs(pool.totalAssets() - poolBefore, 2.0 ether, 1e12);
        // Insurance fund drained by the shortfall (1.069), so ~3.931 remains.
        assertApproxEqAbs(engine.insuranceFund(), 5 ether - 1.069 ether, 1e12);
    }

    function test_badDebtBeyondInsurance_emitsResidual() public {
        engine.depositInsurance{value: 0.5 ether}(); // less than the ~1.069 shortfall
        uint256 pid = _openBadDebtLong();
        uint256 poolBefore = pool.totalAssets();

        vm.prank(keeper);
        engine.liquidate(pid);

        // Pool gets collateral-after-fee (0.931) + all remaining insurance (0.5) = 1.431.
        assertApproxEqAbs(pool.totalAssets() - poolBefore, 0.931 ether + 0.5 ether, 1e12);
        assertEq(engine.insuranceFund(), 0); // fully drained
    }

    function test_solventLiquidationUnaffectedByInsurance() public {
        // A shallow drop that is liquidatable but still solvent (equity > 0).
        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, true, 20, 0); // notional 20, collateral 0.98
        _post(gold, 1960e8); // -2% => pnl -0.4; equity 0.58 < maintenance 0.6 => liquidatable, still solvent
        assertTrue(engine.isLiquidatable(pid));

        uint256 keeperBefore = keeper.balance;
        uint256 traderBefore = alice.balance;
        vm.prank(keeper);
        engine.liquidate(pid);

        // Liquidator gets 5% of collateral; trader gets the remaining equity back; no insurance touched.
        assertApproxEqAbs(keeper.balance - keeperBefore, 0.049 ether, 1e12);
        assertGt(alice.balance, traderBefore); // trader recovers leftover equity
    }
}
