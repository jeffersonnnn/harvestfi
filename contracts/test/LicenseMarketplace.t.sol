// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {CommodityRegistry} from "../src/CommodityRegistry.sol";
import {FeeManager} from "../src/FeeManager.sol";
import {MarketLicenseNFT} from "../src/MarketLicenseNFT.sol";
import {LicenseMarketplace} from "../src/LicenseMarketplace.sol";

contract LicenseMarketplaceTest is Test {
    CommodityRegistry internal registry;
    FeeManager internal feeManager;
    MarketLicenseNFT internal nft;
    LicenseMarketplace internal mkt;

    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    uint256 internal id;

    uint96 internal constant FEE_BPS = 250; // 2.5%

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

        mkt = new LicenseMarketplace(address(nft), address(this), treasury, FEE_BPS);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
        vm.deal(address(this), 10 ether);
    }

    // --- helpers ---
    function _mintTo(address who) internal {
        vm.prank(who);
        nft.mint{value: 0.02 ether}(id);
    }

    function _listBy(address who, uint256 price) internal {
        vm.startPrank(who);
        nft.approve(address(mkt), id);
        mkt.list(id, price);
        vm.stopPrank();
    }

    // --------------------------------------------------------------------- //
    //                            Happy path                                 //
    // --------------------------------------------------------------------- //

    function test_listAndBuy_transfersPaysAndSplitsFee() public {
        _mintTo(alice);
        _listBy(alice, 1 ether);
        assertTrue(mkt.isListed(id));
        (address seller, uint256 price) = mkt.getListing(id);
        assertEq(seller, alice);
        assertEq(price, 1 ether);

        vm.prank(bob);
        mkt.buy{value: 1 ether}(id);

        assertEq(nft.ownerOf(id), bob);
        assertFalse(mkt.isListed(id));
        assertEq(mkt.proceeds(alice), 0.975 ether); // 97.5%
        assertEq(mkt.proceeds(treasury), 0.025 ether); // 2.5%

        uint256 beforeBal = alice.balance;
        vm.prank(alice);
        mkt.withdrawProceeds();
        assertEq(alice.balance - beforeBal, 0.975 ether);
        assertEq(mkt.proceeds(alice), 0);
    }

    /// The core property: on the sale, the NFT checkpoints the seller's accrued market fees to their
    /// withdrawable balance and starts the buyer clean.
    function test_buy_settlesSellerFeesOnTransfer() public {
        _mintTo(alice);
        // engine (this) accrues 1 ETH of fees to the market -> 0.7 ETH holder bucket, 0.3 protocol
        feeManager.accrue{value: 1 ether}(id);
        assertEq(feeManager.pendingHolderFees(id), 0.7 ether);

        _listBy(alice, 2 ether);
        vm.prank(bob);
        mkt.buy{value: 2 ether}(id);

        // seller keeps everything earned before the sale; buyer starts clean
        assertEq(feeManager.pendingHolderFees(id), 0);
        assertEq(feeManager.withdrawable(alice), 0.7 ether);
        assertEq(nft.ownerOf(id), bob);
    }

    function test_updatePrice_thenBuyAtNewPrice() public {
        _mintTo(alice);
        _listBy(alice, 1 ether);
        vm.prank(alice);
        mkt.updatePrice(id, 2 ether);

        vm.prank(bob);
        vm.expectRevert("wrong price");
        mkt.buy{value: 1 ether}(id);

        vm.prank(bob);
        mkt.buy{value: 2 ether}(id);
        assertEq(nft.ownerOf(id), bob);
        assertEq(mkt.proceeds(alice), 1.95 ether);
    }

    function test_cancel_removesListing() public {
        _mintTo(alice);
        _listBy(alice, 1 ether);
        vm.prank(alice);
        mkt.cancel(id);
        assertFalse(mkt.isListed(id));

        vm.prank(bob);
        vm.expectRevert("not listed");
        mkt.buy{value: 1 ether}(id);
    }

    // --------------------------------------------------------------------- //
    //                              Reverts                                  //
    // --------------------------------------------------------------------- //

    function test_revert_buyWrongPrice() public {
        _mintTo(alice);
        _listBy(alice, 1 ether);
        vm.prank(bob);
        vm.expectRevert("wrong price");
        mkt.buy{value: 0.5 ether}(id);
    }

    function test_revert_buyNotListed() public {
        vm.prank(bob);
        vm.expectRevert("not listed");
        mkt.buy{value: 1 ether}(id);
    }

    function test_revert_listNotOwner() public {
        _mintTo(alice);
        vm.prank(bob);
        vm.expectRevert("not owner");
        mkt.list(id, 1 ether);
    }

    function test_revert_listNotApproved() public {
        _mintTo(alice);
        vm.prank(alice);
        vm.expectRevert("not approved");
        mkt.list(id, 1 ether);
    }

    function test_revert_updatePriceNotSeller() public {
        _mintTo(alice);
        _listBy(alice, 1 ether);
        vm.prank(bob);
        vm.expectRevert("not seller");
        mkt.updatePrice(id, 2 ether);
    }

    // --------------------------------------------------------------------- //
    //                          Stale listing                                //
    // --------------------------------------------------------------------- //

    function test_staleListing_buyRevertsAndCanBeDelisted() public {
        _mintTo(alice);
        _listBy(alice, 1 ether);
        // alice moves the token elsewhere; listing is now stale
        vm.prank(alice);
        nft.transferFrom(alice, carol, id);

        vm.prank(bob);
        vm.expectRevert("seller moved token");
        mkt.buy{value: 1 ether}(id);

        // anyone can prune it
        mkt.delistStale(id);
        assertFalse(mkt.isListed(id));
    }

    function test_revert_delistStale_stillValid() public {
        _mintTo(alice);
        _listBy(alice, 1 ether);
        vm.expectRevert("still valid");
        mkt.delistStale(id);
    }

    // --------------------------------------------------------------------- //
    //                               Admin                                   //
    // --------------------------------------------------------------------- //

    function test_setFeeBps_capAndZero() public {
        vm.expectRevert("fee too high");
        mkt.setFeeBps(501);

        mkt.setFeeBps(0);
        _mintTo(alice);
        _listBy(alice, 1 ether);
        vm.prank(bob);
        mkt.buy{value: 1 ether}(id);
        assertEq(mkt.proceeds(alice), 1 ether);
        assertEq(mkt.proceeds(treasury), 0);
    }

    function test_pause_blocksListAndBuy_allowsCancel() public {
        _mintTo(alice);
        _listBy(alice, 1 ether);

        mkt.pause(); // owner
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        mkt.buy{value: 1 ether}(id);

        // cancel still works while paused
        vm.prank(alice);
        mkt.cancel(id);
        assertFalse(mkt.isListed(id));

        // new listings blocked while paused (alice still owns the license)
        vm.startPrank(alice);
        nft.approve(address(mkt), id);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        mkt.list(id, 1 ether);
        vm.stopPrank();
    }

    function test_guardianCanPause() public {
        mkt.setGuardian(bob);
        vm.prank(bob);
        mkt.pause();
        assertTrue(mkt.paused());
    }

    function test_revert_pauseNotGuardian() public {
        vm.prank(bob);
        vm.expectRevert("not guardian");
        mkt.pause();
    }

    // --------------------------------------------------------------------- //
    //                            Reentrancy                                 //
    // --------------------------------------------------------------------- //

    function test_reentrantBuyer_isBlocked() public {
        _mintTo(alice);
        _listBy(alice, 1 ether);

        ReentrantBuyer attacker = new ReentrantBuyer(mkt, id);
        vm.deal(address(attacker), 5 ether);
        vm.expectRevert(); // ReentrancyGuard trips inside the NFT receive callback
        attacker.attack{value: 1 ether}();

        // nothing changed: alice still owns it, listing intact
        assertEq(nft.ownerOf(id), alice);
        assertTrue(mkt.isListed(id));
    }
}

/// Malicious buyer: on receiving the NFT it re-enters buy() for the same token.
contract ReentrantBuyer is IERC721Receiver {
    LicenseMarketplace internal immutable mkt;
    uint256 internal immutable tokenId;

    constructor(LicenseMarketplace mkt_, uint256 tokenId_) {
        mkt = mkt_;
        tokenId = tokenId_;
    }

    function attack() external payable {
        mkt.buy{value: msg.value}(tokenId);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        // try to re-enter; nonReentrant must block this
        mkt.buy{value: 1 ether}(tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}
