// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "../helpers/Base.sol";
import {Handler} from "./Handler.sol";

/// @notice System-wide invariants under randomized open/close/liquidate/deposit/withdraw/price-move
///         /insurance sequences.
contract PerpInvariantTest is Base {
    Handler internal handler;
    uint256 internal gold;

    function setUp() public override {
        super.setUp();
        gold = _listDefault("GOLD", "Metals", 20, 500);
        _post(gold, 2000e8);
        _fundPool(200 ether);

        handler = new Handler(engine, pool, feeManager, oracle, gold, signerPk);
        targetContract(address(handler));
    }

    /// Open interest tracked on-chain matches the sum of live positions' notionals.
    function invariant_openInterestAccounting() public view {
        assertEq(engine.globalOpenNotional(), handler.gNotional());
    }

    /// The engine always holds at least the margin it owes open positions plus the insurance fund -
    /// i.e. it can never become insolvent on its own obligations.
    function invariant_engineSolvency() public view {
        assertGe(address(engine).balance, handler.gCollateral() + engine.insuranceFund());
    }

    /// Every wei in the FeeManager is accounted to a holder bucket, a settled balance, or the protocol.
    function invariant_feeAccounting() public view {
        assertEq(address(feeManager).balance, handler.feeLiabilities());
    }

    /// The pool's reported assets equal its actual ETH balance.
    function invariant_poolAssetsMatchBalance() public view {
        assertEq(pool.totalAssets(), address(pool).balance);
    }

    function invariant_callSummary() public view {
        assertLe(handler.gNotional(), address(engine).balance * 1e6); // sanity, never reverts
    }
}
