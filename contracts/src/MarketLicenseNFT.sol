// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {ICommodityRegistry} from "./interfaces/ICommodityRegistry.sol";
import {IFeeManager} from "./interfaces/IFeeManager.sol";

/// @title MarketLicenseNFT
/// @notice One transferable "market license" per commodity (tokenId == commodityId). Minting costs
///         `mintPrice` in ETH (proceeds to the protocol treasury). The holder earns 70% of that
///         commodity's trading fees via the FeeManager; selling the NFT transfers the fee-right.
///         Metadata + art are rendered fully on-chain in tokenURI (SVG), so licenses show in any wallet.
contract MarketLicenseNFT is ERC721, Ownable, Pausable {
    using Strings for uint256;

    uint256 public mintPrice; // settable by the owner (no redeploy needed to change the price)

    ICommodityRegistry public immutable registry;
    IFeeManager public immutable feeManager;
    address public treasury;

    event LicenseMinted(uint256 indexed commodityId, address indexed to, uint256 price);
    event TreasuryUpdated(address indexed treasury);
    event MintPriceUpdated(uint256 price);

    constructor(address initialOwner, address registry_, address feeManager_, address treasury_)
        ERC721("Commodity Market License", "CML")
        Ownable(initialOwner)
    {
        require(registry_ != address(0) && feeManager_ != address(0) && treasury_ != address(0), "zero addr");
        registry = ICommodityRegistry(registry_);
        feeManager = IFeeManager(feeManager_);
        treasury = treasury_;
        mintPrice = 0.02 ether; // default; owner can lower/raise via setMintPrice
    }

    /// @notice Mint the license for `commodityId`. Only one exists per commodity.
    function mint(uint256 commodityId) external payable whenNotPaused {
        require(registry.isListed(commodityId), "not listed");
        require(msg.value == mintPrice, "wrong price");
        require(_ownerOf(commodityId) == address(0), "already minted");

        _safeMint(msg.sender, commodityId);
        (bool ok,) = payable(treasury).call{value: msg.value}("");
        require(ok, "treasury transfer failed");
        emit LicenseMinted(commodityId, msg.sender, msg.value);
    }

    function setMintPrice(uint256 price) external onlyOwner {
        mintPrice = price;
        emit MintPriceUpdated(price);
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

    /// @dev Category-driven motif: wheat sprig for agricultural markets, a hexagon "element" for the rest.
    function _motif(string memory category) internal pure returns (string memory) {
        if (keccak256(bytes(category)) == keccak256(bytes("Agricultural"))) {
            return string.concat(
                '<line x1="500" y1="360" x2="500" y2="150" stroke="#e4b24a" stroke-width="6" stroke-linecap="round"/>',
                '<ellipse cx="474" cy="330" rx="13" ry="30" fill="#e4b24a" transform="rotate(-38 474 330)"/><ellipse cx="526" cy="330" rx="13" ry="30" fill="#e4b24a" transform="rotate(38 526 330)"/>',
                '<ellipse cx="474" cy="292" rx="13" ry="30" fill="#e4b24a" transform="rotate(-38 474 292)"/><ellipse cx="526" cy="292" rx="13" ry="30" fill="#e4b24a" transform="rotate(38 526 292)"/>',
                '<ellipse cx="474" cy="254" rx="13" ry="30" fill="#e4b24a" transform="rotate(-38 474 254)"/><ellipse cx="526" cy="254" rx="13" ry="30" fill="#e4b24a" transform="rotate(38 526 254)"/>',
                '<ellipse cx="474" cy="216" rx="13" ry="30" fill="#e4b24a" transform="rotate(-38 474 216)"/><ellipse cx="526" cy="216" rx="13" ry="30" fill="#e4b24a" transform="rotate(38 526 216)"/>',
                '<ellipse cx="500" cy="165" rx="13" ry="32" fill="#e4b24a"/>'
            );
        }
        return string.concat(
            '<polygon points="500,150 588,201 588,303 500,354 412,303 412,201" fill="none" stroke="#e4b24a" stroke-width="6" stroke-linejoin="round"/>',
            '<polygon points="500,196 548,224 548,280 500,308 452,280 452,224" fill="none" stroke="#e4b24a" stroke-width="3" stroke-opacity="0.5" stroke-linejoin="round"/>',
            '<circle cx="500" cy="252" r="10" fill="#e4b24a"/>'
        );
    }

    function _svg(ICommodityRegistry.Commodity memory c, uint256 tokenId) internal pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">',
            '<rect width="1000" height="1000" fill="#100c07"/>',
            '<rect x="28" y="28" width="944" height="944" rx="40" fill="#141009" stroke="#3a3327" stroke-width="2"/>',
            '<circle cx="86" cy="100" r="19" fill="none" stroke="#e4b24a" stroke-width="3"/>',
            '<text x="86" y="109" text-anchor="middle" font-family="Georgia,serif" font-size="26" fill="#f2e9d6">H</text>',
            '<text x="122" y="110" font-family="Georgia,serif" font-size="34" fill="#f2e9d6">HarvestFi</text>',
            '<text x="930" y="106" text-anchor="end" font-family="monospace" font-size="20" letter-spacing="3" fill="#8f8878">MARKET LICENSE</text>',
            _motif(c.category),
            '<text x="500" y="500" text-anchor="middle" font-family="Georgia,serif" font-size="140" fill="#f2e9d6">', c.symbol, '</text>',
            '<text x="500" y="548" text-anchor="middle" font-family="monospace" font-size="24" letter-spacing="4" fill="#8f8878">LICENSE #', tokenId.toString(), '</text>',
            '<text x="500" y="720" text-anchor="middle" font-family="Georgia,serif" font-size="180" fill="#e4b24a">70%</text>',
            '<text x="500" y="770" text-anchor="middle" font-family="monospace" font-size="26" letter-spacing="6" fill="#c9c0ad">OF TRADING FEES</text>',
            '<line x1="70" y1="855" x2="930" y2="855" stroke="#2a2419" stroke-width="1.5"/>',
            '<text x="70" y="905" font-family="monospace" font-size="22" letter-spacing="2" fill="#a89f8c">', c.category, ' / PER ', c.unit, '</text>',
            '<text x="930" y="905" text-anchor="end" font-family="monospace" font-size="22" letter-spacing="2" fill="#93c069">TRANSFERABLE</text>',
            '</svg>'
        );
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        ICommodityRegistry.Commodity memory c = registry.getCommodity(tokenId);
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(_svg(c, tokenId))));
        string memory json = string.concat(
            '{"name":"', c.symbol, ' Market License #', tokenId.toString(),
            '","description":"Entitles the holder to 70% of trading fees for the ', c.symbol,
            ' market on HarvestFi.","image":"', image,
            '","attributes":[{"trait_type":"Symbol","value":"', c.symbol,
            '"},{"trait_type":"Category","value":"', c.category,
            '"},{"trait_type":"Unit","value":"', c.unit,
            '"},{"trait_type":"Fee share","value":"70%"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
