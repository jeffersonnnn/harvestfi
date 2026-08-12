// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICommodityRegistry} from "./interfaces/ICommodityRegistry.sol";

/// @title CommodityRegistry
/// @notice Owner-managed list of tradable commodities and their per-market risk parameters.
///         `commodityId` is a sequential id shared by every other contract in the system.
contract CommodityRegistry is ICommodityRegistry, Ownable {
    uint256 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 1_000; // 10% hard cap on open/close fees

    uint256 public nextId;
    mapping(uint256 => Commodity) private _commodities;

    event CommodityListed(uint256 indexed id, string symbol, string category);
    event CommodityParamsUpdated(uint256 indexed id);
    event CommodityDelisted(uint256 indexed id);
    event CommodityRelisted(uint256 indexed id);

    constructor(address initialOwner) Ownable(initialOwner) {}

    struct RiskParams {
        uint16 maxLeverageX;
        uint16 maintenanceMarginBps;
        uint16 openFeeBps;
        uint16 closeFeeBps;
        uint256 maxOpenInterestEth;
    }

    /// @notice List a new commodity. Returns its id.
    function list(
        string calldata symbol,
        string calldata unit,
        string calldata quoteCurrency,
        string calldata category,
        RiskParams calldata params
    ) external onlyOwner returns (uint256 id) {
        require(bytes(symbol).length != 0, "symbol empty");
        _validate(params);

        id = nextId++;
        _commodities[id] = Commodity({
            symbol: symbol,
            unit: unit,
            quoteCurrency: quoteCurrency,
            category: category,
            listed: true,
            maxLeverageX: params.maxLeverageX,
            maintenanceMarginBps: params.maintenanceMarginBps,
            openFeeBps: params.openFeeBps,
            closeFeeBps: params.closeFeeBps,
            maxOpenInterestEth: params.maxOpenInterestEth
        });
        emit CommodityListed(id, symbol, category);
    }

    /// @notice Update the risk parameters of an existing commodity.
    function setParams(uint256 id, RiskParams calldata params) external onlyOwner {
        require(id < nextId, "unknown id");
        _validate(params);
        Commodity storage c = _commodities[id];
        c.maxLeverageX = params.maxLeverageX;
        c.maintenanceMarginBps = params.maintenanceMarginBps;
        c.openFeeBps = params.openFeeBps;
        c.closeFeeBps = params.closeFeeBps;
        c.maxOpenInterestEth = params.maxOpenInterestEth;
        emit CommodityParamsUpdated(id);
    }

    /// @notice Stop new positions/mints for a commodity (does not affect existing positions).
    function delist(uint256 id) external onlyOwner {
        require(id < nextId, "unknown id");
        _commodities[id].listed = false;
        emit CommodityDelisted(id);
    }

    function relist(uint256 id) external onlyOwner {
        require(id < nextId, "unknown id");
        _commodities[id].listed = true;
        emit CommodityRelisted(id);
    }

    function isListed(uint256 id) external view returns (bool) {
        return _commodities[id].listed;
    }

    function getCommodity(uint256 id) external view returns (Commodity memory) {
        return _commodities[id];
    }

    function count() external view returns (uint256) {
        return nextId;
    }

    function _validate(RiskParams calldata p) internal pure {
        require(p.maxLeverageX >= 1, "leverage<1");
        require(p.maintenanceMarginBps > 0 && p.maintenanceMarginBps < BPS, "bad maintenance");
        require(p.openFeeBps <= MAX_FEE_BPS && p.closeFeeBps <= MAX_FEE_BPS, "fee too high");
    }
}
