// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommodityRegistry} from "../src/CommodityRegistry.sol";
import {LaunchRegistry} from "../src/LaunchRegistry.sol";

contract MockVault {
    mapping(uint256 => address) internal owners;

    function setOwner(uint256 id, address o) external {
        owners[id] = o;
    }

    function ownerOf(uint256 id) external view returns (address) {
        return owners[id];
    }
}

contract LaunchRegistryTest is Test {
    CommodityRegistry internal registry;
    MockVault internal vault;
    LaunchRegistry internal lr;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal cornId;

    function setUp() public {
        registry = new CommodityRegistry(address(this));
        vault = new MockVault();
        lr = new LaunchRegistry(address(registry), address(vault));
        cornId = registry.list(
            "CORN",
            "Bu",
            "USD",
            "Agricultural",
            CommodityRegistry.RiskParams({
                maxLeverageX: 10,
                maintenanceMarginBps: 500,
                openFeeBps: 5,
                closeFeeBps: 5,
                maxOpenInterestEth: 0
            })
        );
    }

    function test_register_happy() public {
        address token = makeAddr("cornCoin");
        uint256 pid = 667185;
        vault.setOwner(pid, alice);

        vm.prank(alice);
        uint256 idx = lr.register(token, cornId, pid);

        assertEq(idx, 0);
        assertTrue(lr.isRegistered(token));
        assertEq(lr.launchCount(), 1);
        LaunchRegistry.Launch memory L = lr.getLaunch(0);
        assertEq(L.token, token);
        assertEq(L.marketId, cornId);
        assertEq(L.positionId, pid);
        assertEq(L.creator, alice);

        uint256[] memory forMarket = lr.launchesForMarket(cornId);
        assertEq(forMarket.length, 1);
        assertEq(forMarket[0], 0);
        assertEq(lr.launchCountForMarket(cornId), 1);
    }

    function test_revert_notFeeOwner() public {
        vault.setOwner(1, alice);
        vm.prank(bob);
        vm.expectRevert("not fee owner");
        lr.register(makeAddr("t"), cornId, 1);
    }

    function test_revert_marketNotListed() public {
        vault.setOwner(1, alice);
        vm.prank(alice);
        vm.expectRevert("market not listed");
        lr.register(makeAddr("t"), 999, 1);
    }

    function test_revert_doubleRegister() public {
        address token = makeAddr("t");
        vault.setOwner(1, alice);
        vault.setOwner(2, alice);
        vm.startPrank(alice);
        lr.register(token, cornId, 1);
        vm.expectRevert("already registered");
        lr.register(token, cornId, 2);
        vm.stopPrank();
    }

    function test_recentLaunches_newestFirst() public {
        address t1 = makeAddr("t1");
        address t2 = makeAddr("t2");
        address t3 = makeAddr("t3");
        vault.setOwner(1, alice);
        vault.setOwner(2, alice);
        vault.setOwner(3, alice);
        vm.startPrank(alice);
        lr.register(t1, cornId, 1);
        lr.register(t2, cornId, 2);
        lr.register(t3, cornId, 3);
        vm.stopPrank();

        LaunchRegistry.Launch[] memory page = lr.recentLaunches(0, 2);
        assertEq(page.length, 2);
        assertEq(page[0].token, t3); // newest first
        assertEq(page[1].token, t2);

        LaunchRegistry.Launch[] memory none = lr.recentLaunches(10, 5);
        assertEq(none.length, 0);
    }
}
