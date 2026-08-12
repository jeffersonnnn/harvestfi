// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ICommodityRegistry} from "./interfaces/ICommodityRegistry.sol";
import {IFeeManager} from "./interfaces/IFeeManager.sol";

/// @title MarketLicenseNFT
/// @notice One transferable "market license" per commodity (tokenId == commodityId). Minting costs
///         a fixed price in ETH (proceeds to the protocol treasury). The holder earns 70% of that
///         commodity's trading fees via the FeeManager; selling the NFT transfers the fee-right.
contract MarketLicenseNFT is ERC721, Ownable, Pausable {
    using Strings for uint256;

    uint256 public constant MINT_PRICE = 0.02 ether;

    ICommodityRegistry public immutable registry;
    IFeeManager public immutable feeManager;
    address public treasury;

    event LicenseMinted(uint256 indexed commodityId, address indexed to, uint256 price);
    event TreasuryUpdated(address indexed treasury);

    constructor(address initialOwner, address registry_, address feeManager_, address treasury_)
        ERC721("Commodity Market License", "CML")
        Ownable(initialOwner)
    {
        require(registry_ != address(0) && feeManager_ != address(0) && treasury_ != address(0), "zero addr");
        registry = ICommodityRegistry(registry_);
        feeManager = IFeeManager(feeManager_);
        treasury = treasury_;
    }

    /// @notice Mint the license for `commodityId`. Only one exists per commodity.
    function mint(uint256 commodityId) external payable whenNotPaused {
        require(registry.isListed(commodityId), "not listed");
        require(msg.value == MINT_PRICE, "wrong price");
        require(_ownerOf(commodityId) == address(0), "already minted");

        _safeMint(msg.sender, commodityId);
        (bool ok,) = payable(treasury).call{value: msg.value}("");
        require(ok, "treasury transfer failed");
        emit LicenseMinted(commodityId, msg.sender, msg.value);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury=0");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /// @notice Pause/resume minting (does NOT affect transfers, so holders are never trapped). Owner only.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function exists(uint256 commodityId) external view returns (bool) {
        return _ownerOf(commodityId) != address(0);
    }

    /// @dev On every real transfer (not mint/burn) checkpoint the outgoing owner's accrued fees.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0)) {
            feeManager.onLicenseTransfer(tokenId, from);
        }
        return from;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        ICommodityRegistry.Commodity memory c = registry.getCommodity(tokenId);
        // Minimal on-chain JSON (rich art is a later phase).
        string memory json = string.concat(
            '{"name":"',
            c.symbol,
            " Market License #",
            tokenId.toString(),
            '","description":"Entitles the holder to 70% of trading fees for the ',
            c.symbol,
            ' commodity perp market.","attributes":[{"trait_type":"Symbol","value":"',
            c.symbol,
            '"},{"trait_type":"Category","value":"',
            c.category,
            '"},{"trait_type":"Unit","value":"',
            c.unit,
            '"}]}'
        );
        return string.concat("data:application/json;utf8,", json);
    }
}
