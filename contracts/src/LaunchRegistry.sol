// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICommodityRegistry} from "./interfaces/ICommodityRegistry.sol";

/// @notice Minimal ERC721 ownerOf for the pools.trade beneficiary vault (the creator-fee NFT).
interface IBeneficiaryVault {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title LaunchRegistry
/// @notice Records coins launched on HarvestFi and pairs each to one commodity market. This is the
///         index the token explorer reads. It does NOT launch or hold funds - a coin is first
///         launched on pools.trade (creator-fee mode), then registered here.
///
///         Permissionless, but guarded so entries are meaningful: the market must be listed, and the
///         caller must currently hold that launch's creator-fee (beneficiary) NFT - i.e. only the real
///         fee owner can register their coin. The pairing is "themed on a market" only (oracle price +
///         explorer grouping); the coin's engine is its own pools.trade creator fees.
contract LaunchRegistry {
    struct Launch {
        address token; // the launched ERC20 (pools.trade UERC20)
        uint256 marketId; // the commodity market this coin is themed on
        uint256 positionId; // the pools.trade beneficiary NFT id (creator-fee stream)
        address creator; // who registered it (held the fee NFT at registration)
        uint64 timestamp;
    }

    ICommodityRegistry public immutable registry;
    IBeneficiaryVault public immutable beneficiaryVault;

    Launch[] public launches;
    mapping(address => uint256) public indexOfToken; // token => (index + 1); 0 = not registered
    mapping(uint256 => uint256[]) internal _byMarket; // marketId => launch indexes

    event HarvestFiLaunch(
        address indexed token, uint256 indexed marketId, uint256 positionId, address indexed creator, uint256 index
    );

    constructor(address registry_, address beneficiaryVault_) {
        require(registry_ != address(0) && beneficiaryVault_ != address(0), "zero addr");
        registry = ICommodityRegistry(registry_);
        beneficiaryVault = IBeneficiaryVault(beneficiaryVault_);
    }

    /// @notice Register a launched coin, paired to `marketId`. Caller must hold the coin's creator-fee
    ///         NFT (`positionId`) and the market must be listed. One registration per token.
    function register(address token, uint256 marketId, uint256 positionId) external returns (uint256 index) {
        require(token != address(0), "token=0");
        require(indexOfToken[token] == 0, "already registered");
        require(registry.isListed(marketId), "market not listed");
        require(beneficiaryVault.ownerOf(positionId) == msg.sender, "not fee owner");

        index = launches.length;
        launches.push(Launch(token, marketId, positionId, msg.sender, uint64(block.timestamp)));
        indexOfToken[token] = index + 1;
        _byMarket[marketId].push(index);
        emit HarvestFiLaunch(token, marketId, positionId, msg.sender, index);
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    function getLaunch(uint256 i) external view returns (Launch memory) {
        return launches[i];
    }

    /// @notice Launch indexes for a market (for the explorer's per-market view).
    function launchesForMarket(uint256 marketId) external view returns (uint256[] memory) {
        return _byMarket[marketId];
    }

    function launchCountForMarket(uint256 marketId) external view returns (uint256) {
        return _byMarket[marketId].length;
    }

    function isRegistered(address token) external view returns (bool) {
        return indexOfToken[token] != 0;
    }

    /// @notice Page through launches newest-first for the explorer. Returns up to `limit` entries
    ///         starting `offset` back from the end.
    function recentLaunches(uint256 offset, uint256 limit) external view returns (Launch[] memory page) {
        uint256 n = launches.length;
        if (offset >= n) return new Launch[](0);
        uint256 remaining = n - offset;
        uint256 count = remaining < limit ? remaining : limit;
        page = new Launch[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = launches[n - 1 - offset - i];
        }
    }
}
