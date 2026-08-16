// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LicenseMarketplace
/// @notice A non-custodial secondary market for a single fee-earning ERC721 collection (the
///         MarketLicenseNFT). Holders list a license at an ETH price; a buyer pays that price and the
///         license transfers to them. The NFT never leaves the seller's wallet while listed, so the
///         seller KEEPS EARNING that market's fees right up to the moment of sale.
///
///         Fee accounting is handled by the NFT/FeeManager, not here: on the sale transfer the NFT's
///         `_update` checkpoints the seller's accrued fees to their withdrawable balance and starts the
///         buyer clean. So this contract only moves the NFT and the money.
///
///         ETH is pull-payment: a sale credits the seller (and the protocol fee credits the treasury);
///         each party later calls {withdrawProceeds}. This matches the protocol's owed/withdrawable
///         discipline and avoids a hostile seller/treasury bricking a purchase.
contract LicenseMarketplace is Ownable, Pausable, ReentrancyGuard {
    uint96 public constant MAX_FEE_BPS = 500; // hard cap: protocol fee can never exceed 5%
    uint96 public constant BPS = 10_000;

    IERC721 public immutable nft; // the license collection this marketplace serves

    address public treasury; // receives the protocol fee on each sale (pull)
    address public guardian; // may pause in an incident; owner unpauses
    uint96 public feeBps; // protocol fee in basis points (<= MAX_FEE_BPS)

    struct Listing {
        address seller;
        uint256 price; // in wei; 0 == no active listing
    }

    mapping(uint256 => Listing) public listings; // tokenId => listing
    mapping(address => uint256) public proceeds; // pull-payment balances (sellers + treasury)

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event PriceUpdated(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee);
    event ProceedsWithdrawn(address indexed account, uint256 amount);
    event StaleDelisted(uint256 indexed tokenId, address indexed seller);
    event FeeBpsUpdated(uint96 feeBps);
    event TreasuryUpdated(address indexed treasury);
    event GuardianUpdated(address indexed guardian);

    constructor(address nft_, address initialOwner, address treasury_, uint96 feeBps_) Ownable(initialOwner) {
        require(nft_ != address(0) && treasury_ != address(0), "zero addr");
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");
        nft = IERC721(nft_);
        treasury = treasury_;
        feeBps = feeBps_;
        guardian = initialOwner;
    }

    // --------------------------------------------------------------------- //
    //                                Listings                               //
    // --------------------------------------------------------------------- //

    /// @notice List a license you own at `price` (wei). You must first approve this marketplace for the
    ///         token (`approve(marketplace, tokenId)` or `setApprovalForAll`). Re-listing overwrites.
    function list(uint256 tokenId, uint256 price) external whenNotPaused {
        require(price > 0, "price=0");
        require(nft.ownerOf(tokenId) == msg.sender, "not owner");
        require(_approved(tokenId, msg.sender), "not approved");
        listings[tokenId] = Listing(msg.sender, price);
        emit Listed(tokenId, msg.sender, price);
    }

    /// @notice Change the price of your active listing.
    function updatePrice(uint256 tokenId, uint256 newPrice) external whenNotPaused {
        require(newPrice > 0, "price=0");
        Listing storage l = listings[tokenId];
        require(l.seller == msg.sender, "not seller");
        l.price = newPrice;
        emit PriceUpdated(tokenId, msg.sender, newPrice);
    }

    /// @notice Remove your listing. Always available, even while paused.
    function cancel(uint256 tokenId) external {
        require(listings[tokenId].seller == msg.sender, "not seller");
        delete listings[tokenId];
        emit Cancelled(tokenId, msg.sender);
    }

    /// @notice Permissionless cleanup: drop a listing whose seller no longer owns the token (they moved
    ///         or sold it elsewhere). Keeps the board honest.
    function delistStale(uint256 tokenId) external {
        Listing memory l = listings[tokenId];
        require(l.seller != address(0), "not listed");
        require(nft.ownerOf(tokenId) != l.seller || !_approved(tokenId, l.seller), "still valid");
        delete listings[tokenId];
        emit StaleDelisted(tokenId, l.seller);
    }

    /// @notice Buy a listed license at its exact price. The NFT transfers to you; fees settle to the
    ///         seller automatically; the seller and treasury pull their ETH via {withdrawProceeds}.
    function buy(uint256 tokenId) external payable nonReentrant whenNotPaused {
        Listing memory l = listings[tokenId];
        require(l.seller != address(0), "not listed");
        require(msg.value == l.price, "wrong price");
        require(nft.ownerOf(tokenId) == l.seller, "seller moved token");

        // effects before interactions
        delete listings[tokenId];
        uint256 fee = (l.price * feeBps) / BPS;
        uint256 sellerAmount = l.price - fee;
        proceeds[l.seller] += sellerAmount;
        if (fee > 0) proceeds[treasury] += fee;

        // interaction: move the NFT (this triggers the NFT's fee checkpoint to the seller)
        nft.safeTransferFrom(l.seller, msg.sender, tokenId);

        emit Sold(tokenId, l.seller, msg.sender, l.price, fee);
    }

    /// @notice Pull your accrued sale proceeds (sellers) or protocol fees (treasury).
    function withdrawProceeds() external nonReentrant returns (uint256 amount) {
        amount = proceeds[msg.sender];
        require(amount > 0, "nothing");
        proceeds[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit ProceedsWithdrawn(msg.sender, amount);
    }

    // --------------------------------------------------------------------- //
    //                                 Admin                                 //
    // --------------------------------------------------------------------- //

    function setFeeBps(uint96 feeBps_) external onlyOwner {
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");
        feeBps = feeBps_;
        emit FeeBpsUpdated(feeBps_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury=0");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setGuardian(address guardian_) external onlyOwner {
        require(guardian_ != address(0), "guardian=0");
        guardian = guardian_;
        emit GuardianUpdated(guardian_);
    }

    /// @notice Halt new listings and buys in an incident. Cancels/withdrawals stay open so no one is
    ///         trapped. Callable by the guardian or owner.
    function pause() external {
        require(msg.sender == guardian || msg.sender == owner(), "not guardian");
        _pause();
    }

    /// @notice Resume. Owner only.
    function unpause() external onlyOwner {
        _unpause();
    }

    // --------------------------------------------------------------------- //
    //                                 Views                                 //
    // --------------------------------------------------------------------- //

    function isListed(uint256 tokenId) external view returns (bool) {
        return listings[tokenId].seller != address(0);
    }

    function getListing(uint256 tokenId) external view returns (address seller, uint256 price) {
        Listing memory l = listings[tokenId];
        return (l.seller, l.price);
    }

    function _approved(uint256 tokenId, address holder) internal view returns (bool) {
        return nft.getApproved(tokenId) == address(this) || nft.isApprovedForAll(holder, address(this));
    }
}
