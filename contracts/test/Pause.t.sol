// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./helpers/Base.sol";

/// @notice Emergency pause: new positions/mints halt, but exits (close/liquidate) always remain open.
contract PauseTest is Base {
    uint256 internal gold;

    function setUp() public override {
        super.setUp();
        gold = _listDefault("GOLD", "Metals", 10, 500);
        _post(gold, 2000e8);
        _fundPool(500 ether);
    }

    function test_guardianCanPause_ownerUnpause() public {
        address guardian = makeAddr("guardian");
        engine.setGuardian(guardian);

        vm.prank(guardian);
        engine.pause();
        assertTrue(engine.paused());

        vm.prank(alice);
        vm.expectRevert(); // EnforcedPause
        engine.openPosition{value: 1 ether}(gold, true, 5, 0);

        engine.unpause(); // owner (this test)
        assertFalse(engine.paused());

        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, true, 5, 0);
        assertEq(engine.getPosition(pid).trader, alice);
    }

    function test_pausedStillAllowsClose() public {
        // Open before pausing.
        vm.prank(alice);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, true, 10, 0);

        engine.pause();

        // Close still works while paused (users can always exit).
        _post(gold, 2010e8);
        vm.prank(alice);
        engine.closePosition(pid, 0);
        assertEq(engine.getPosition(pid).trader, address(0));
    }

    function test_openBlockedButLiquidateAllowedWhenPaused() public {
        vm.prank(bob);
        uint256 pid = engine.openPosition{value: 1 ether}(gold, true, 10, 0); // notional 10, maint 0.5

        engine.pause();

        // New opens blocked.
        vm.prank(alice);
        vm.expectRevert();
        engine.openPosition{value: 1 ether}(gold, true, 5, 0);

        // Liquidation still allowed.
        _post(gold, 1880e8); // -6% => liquidatable
        assertTrue(engine.isLiquidatable(pid));
        vm.prank(keeper);
        engine.liquidate(pid);
        assertEq(engine.getPosition(pid).trader, address(0));
    }

    function test_revert_pause_notGuardian() public {
        vm.prank(address(0xBAD));
        vm.expectRevert("not guardian");
        engine.pause();
    }

    function test_nftMintPause() public {
        nft.pause();
        vm.prank(alice);
        vm.expectRevert(); // EnforcedPause
        nft.mint{value: 0.02 ether}(gold);

        nft.unpause();
        vm.prank(alice);
        nft.mint{value: 0.02 ether}(gold);
        assertEq(nft.ownerOf(gold), alice);
    }
}
