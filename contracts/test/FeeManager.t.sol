// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FeeManager} from "../src/FeeManager.sol";

/// @dev Minimal ERC721 stand-in exposing only the `ownerOf` the FeeManager uses.
contract MockNFT {
    mapping(uint256 => address) public owners;

    function setOwner(uint256 id, address owner_) external {
        owners[id] = owner_;
    }

    function ownerOf(uint256 id) external view returns (address) {
        return owners[id];
    }
}

/// @dev This test contract plays the role of the perp engine (calls `accrue`).
contract FeeManagerTest is Test {
    FeeManager internal feeManager;
    MockNFT internal mockNft;

    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        feeManager = new FeeManager(address(this), treasury);
        mockNft = new MockNFT();
        feeManager.setNFT(address(mockNft));
        feeManager.setPerpEngine(address(this));
        vm.deal(address(this), 100 ether);
    }

    function test_accrueSplits70_30() public {
        feeManager.accrue{value: 1 ether}(5);
        assertEq(feeManager.commodityBucket(5), 0.7 ether);
        assertEq(feeManager.protocolFees(), 0.3 ether);
    }

    function test_currentHolderClaims() public {
        feeManager.accrue{value: 1 ether}(5);
        mockNft.setOwner(5, alice);

        uint256 before = alice.balance;
        vm.prank(alice);
        feeManager.claim(5);
        assertEq(alice.balance - before, 0.7 ether);
        assertEq(feeManager.commodityBucket(5), 0);
    }

    function test_revert_claim_notHolder() public {
        feeManager.accrue{value: 1 ether}(5);
        mockNft.setOwner(5, alice);
        vm.prank(bob);
        vm.expectRevert("not holder");
        feeManager.claim(5);
    }

    function test_transferCheckpointsToSeller() public {
        feeManager.accrue{value: 1 ether}(5); // bucket 0.7 belongs to current holder alice
        mockNft.setOwner(5, alice);

        // Simulate the NFT transfer hook firing as alice sells to bob.
        vm.prank(address(mockNft));
        feeManager.onLicenseTransfer(5, alice);
        mockNft.setOwner(5, bob);

        assertEq(feeManager.commodityBucket(5), 0);
        assertEq(feeManager.withdrawable(alice), 0.7 ether);

        // New fees now accrue to bob.
        feeManager.accrue{value: 2 ether}(5);
        assertEq(feeManager.commodityBucket(5), 1.4 ether);

        // Alice claims only her pre-sale earnings; bob claims post-sale.
        uint256 aBefore = alice.balance;
        vm.prank(alice);
        feeManager.claimSettled();
        assertEq(alice.balance - aBefore, 0.7 ether);

        uint256 bBefore = bob.balance;
        vm.prank(bob);
        feeManager.claim(5);
        assertEq(bob.balance - bBefore, 1.4 ether);
    }

    function test_withdrawProtocolFees() public {
        feeManager.accrue{value: 1 ether}(5);
        uint256 before = treasury.balance;
        feeManager.withdrawProtocolFees();
        assertEq(treasury.balance - before, 0.3 ether);
        assertEq(feeManager.protocolFees(), 0);
    }

    function test_revert_accrue_notPerp() public {
        vm.deal(address(0xBAD), 1 ether);
        vm.prank(address(0xBAD));
        vm.expectRevert("only perp");
        feeManager.accrue{value: 1 ether}(5);
    }

    function test_revert_onLicenseTransfer_notNft() public {
        vm.prank(address(0xBAD));
        vm.expectRevert("only nft");
        feeManager.onLicenseTransfer(5, alice);
    }

    function test_invariant_balanceEqualsLiabilities() public {
        feeManager.accrue{value: 3 ether}(5);
        mockNft.setOwner(5, alice);
        vm.prank(address(mockNft));
        feeManager.onLicenseTransfer(5, alice);
        feeManager.accrue{value: 1 ether}(5);

        uint256 liabilities = feeManager.commodityBucket(5) + feeManager.withdrawable(alice) + feeManager.protocolFees();
        assertEq(address(feeManager).balance, liabilities);
    }
}
