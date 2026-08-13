// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommodityRegistry} from "../src/CommodityRegistry.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {MarketLicenseNFT} from "../src/MarketLicenseNFT.sol";

contract MarketLicenseNFTTest is Test {
    CommodityRegistry internal registry;
    FeeManager internal feeManager;
    MarketLicenseNFT internal nft;

    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal id;

    function setUp() public {
        registry = new CommodityRegistry(address(this));
        feeManager = new FeeManager(address(this), treasury);
        nft = new MarketLicenseNFT(address(this), address(registry), address(feeManager), treasury);
        feeManager.setNFT(address(nft));
        feeManager.setPerpEngine(address(this)); // this test acts as the engine to accrue fees

        id = registry.list(
            "CORN",
            "Bu",
            "USD",
            "Agricultural",
            CommodityRegistry.RiskParams({
                maxLeverageX: 10,
                maintenanceMarginBps: 500,
                openFeeBps: 10,
                closeFeeBps: 10,
                maxOpenInterestEth: 0
            })
        );

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(address(this), 10 ether);
    }

    function test_mintAtExactPrice_proceedsToTreasury() public {
        uint256 before = treasury.balance;
        vm.prank(alice);
        nft.mint{value: 0.02 ether}(id);
        assertEq(nft.ownerOf(id), alice);
        assertEq(treasury.balance - before, 0.02 ether);
    }

    function test_revert_wrongPrice() public {
        vm.prank(alice);
        vm.expectRevert("wrong price");
        nft.mint{value: 0.01 ether}(id);
    }

    function test_revert_doubleMint() public {
        vm.prank(alice);
        nft.mint{value: 0.02 ether}(id);
        vm.prank(bob);
        vm.expectRevert("already minted");
        nft.mint{value: 0.02 ether}(id);
    }

    function test_revert_notListed() public {
        vm.prank(alice);
        vm.expectRevert("not listed");
        nft.mint{value: 0.02 ether}(999);
    }

    function test_transferCheckpointsFeesToSeller() public {
        vm.prank(alice);
        nft.mint{value: 0.02 ether}(id);

        // Accrue fees while alice holds the license.
        feeManager.accrue{value: 1 ether}(id);
        assertEq(feeManager.commodityBucket(id), 0.7 ether);

        // Alice sells to bob -> the transfer hook checkpoints her earnings.
        vm.prank(alice);
        nft.transferFrom(alice, bob, id);
        assertEq(nft.ownerOf(id), bob);
        assertEq(feeManager.commodityBucket(id), 0);
        assertEq(feeManager.withdrawable(alice), 0.7 ether);

        // Fees now accrue to bob.
        feeManager.accrue{value: 1 ether}(id);
        uint256 bBefore = bob.balance;
        vm.prank(bob);
        feeManager.claim(id);
        assertEq(bob.balance - bBefore, 0.7 ether);
    }

    function test_tokenURI() public {
        vm.prank(alice);
        nft.mint{value: 0.02 ether}(id);
        string memory uri = nft.tokenURI(id);
        assertGt(bytes(uri).length, 0);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function test_setMintPrice_changesPrice() public {
        nft.setMintPrice(0.002 ether);
        assertEq(nft.mintPrice(), 0.002 ether);
        vm.prank(alice);
        vm.expectRevert("wrong price");
        nft.mint{value: 0.02 ether}(id); // old price now rejected
        vm.prank(alice);
        nft.mint{value: 0.002 ether}(id);
        assertEq(nft.ownerOf(id), alice);
    }

    function test_revert_setMintPrice_notOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        nft.setMintPrice(0.001 ether);
    }

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory sb = bytes(s);
        bytes memory pb = bytes(prefix);
        if (sb.length < pb.length) return false;
        for (uint256 i = 0; i < pb.length; i++) {
            if (sb[i] != pb[i]) return false;
        }
        return true;
    }
}
