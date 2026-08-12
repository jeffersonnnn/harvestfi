// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IFeeManager} from "./interfaces/IFeeManager.sol";

/// @title FeeManager
/// @notice Collects native-ETH trading fees from the perp engine and splits each fee 70% to the
///         current holder of the commodity's license NFT / 30% to the protocol treasury.
///
///         Fees accrue into a per-commodity bucket claimable by whoever holds the license *now*.
///         When a license is transferred, the NFT calls {onLicenseTransfer}, which settles the
///         bucket to the outgoing owner's personal balance and zeroes it — so the seller keeps
///         everything earned before the sale and the buyer earns cleanly from the sale forward.
contract FeeManager is IFeeManager, ReentrancyGuard {
    uint256 public constant BPS = 10_000;
    uint256 public constant HOLDER_BPS = 7_000; // 70% to the license holder

    address public owner;
    address public treasury;
    address public nft;
    address public perpEngine;

    mapping(uint256 => uint256) public commodityBucket; // 70% share accrued for the current holder
    mapping(address => uint256) public withdrawable; // fees settled to past holders (on transfer)
    uint256 public protocolFees; // 30% share owed to the treasury

    event Accrued(uint256 indexed commodityId, uint256 holderCut, uint256 protocolCut);
    event LicenseCheckpointed(uint256 indexed commodityId, address indexed from, uint256 amount);
    event HolderFeesClaimed(uint256 indexed commodityId, address indexed holder, uint256 amount);
    event SettledFeesClaimed(address indexed holder, uint256 amount);
    event ProtocolFeesWithdrawn(address indexed treasury, uint256 amount);
    event TreasuryUpdated(address indexed treasury);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyNft() {
        require(msg.sender == nft, "only nft");
        _;
    }

    modifier onlyPerp() {
        require(msg.sender == perpEngine, "only perp");
        _;
    }

    constructor(address owner_, address treasury_) {
        require(owner_ != address(0), "owner=0");
        require(treasury_ != address(0), "treasury=0");
        owner = owner_;
        treasury = treasury_;
    }

    function setNFT(address nft_) external onlyOwner {
        require(nft == address(0), "nft set");
        require(nft_ != address(0), "nft=0");
        nft = nft_;
    }

    function setPerpEngine(address perpEngine_) external onlyOwner {
        require(perpEngine == address(0), "perp set");
        require(perpEngine_ != address(0), "perp=0");
        perpEngine = perpEngine_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury=0");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /// @inheritdoc IFeeManager
    function accrue(uint256 commodityId) external payable onlyPerp {
        if (msg.value == 0) return;
        uint256 holderCut = (msg.value * HOLDER_BPS) / BPS;
        uint256 protocolCut = msg.value - holderCut;
        commodityBucket[commodityId] += holderCut;
        protocolFees += protocolCut;
        emit Accrued(commodityId, holderCut, protocolCut);
    }

    /// @inheritdoc IFeeManager
    function onLicenseTransfer(uint256 commodityId, address from) external onlyNft {
        uint256 amount = commodityBucket[commodityId];
        if (amount > 0) {
            commodityBucket[commodityId] = 0;
            withdrawable[from] += amount;
        }
        emit LicenseCheckpointed(commodityId, from, amount);
    }

    /// @notice Current license holder claims the commodity's accrued holder fees.
    function claim(uint256 commodityId) external nonReentrant returns (uint256 amount) {
        address holder = IERC721(nft).ownerOf(commodityId);
        require(msg.sender == holder, "not holder");
        amount = commodityBucket[commodityId];
        require(amount > 0, "nothing");
        commodityBucket[commodityId] = 0;
        _sendValue(holder, amount);
        emit HolderFeesClaimed(commodityId, holder, amount);
    }

    /// @notice Claim fees that were settled to the caller when they sold a license.
    function claimSettled() external nonReentrant returns (uint256 amount) {
        amount = withdrawable[msg.sender];
        require(amount > 0, "nothing");
        withdrawable[msg.sender] = 0;
        _sendValue(msg.sender, amount);
        emit SettledFeesClaimed(msg.sender, amount);
    }

    /// @notice Withdraw the protocol's accrued 30% share to the treasury.
    function withdrawProtocolFees() external nonReentrant returns (uint256 amount) {
        require(msg.sender == owner || msg.sender == treasury, "not authorized");
        amount = protocolFees;
        require(amount > 0, "nothing");
        protocolFees = 0;
        _sendValue(treasury, amount);
        emit ProtocolFeesWithdrawn(treasury, amount);
    }

    function pendingHolderFees(uint256 commodityId) external view returns (uint256) {
        return commodityBucket[commodityId];
    }

    function _sendValue(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "ETH transfer failed");
    }
}
