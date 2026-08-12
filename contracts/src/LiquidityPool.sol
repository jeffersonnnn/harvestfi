// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILiquidityPool} from "./interfaces/ILiquidityPool.sol";
import {IPerpEngine} from "./interfaces/IPerpEngine.sol";

/// @title LiquidityPool
/// @notice Shared counterparty vault for all commodity perp markets. LPs deposit native ETH and
///         receive internal shares; the pool pays trader profits and absorbs trader losses, so its
///         share price rises when traders lose in aggregate and falls when they win.
///
///         The pool holds ONLY LP capital + settled PnL (trader margin is custodied by the engine),
///         so `totalAssets()` is simply the contract's ETH balance.
contract LiquidityPool is ILiquidityPool, ReentrancyGuard {
    address public owner;
    address public perpEngine;

    uint256 public totalShares;
    mapping(address => uint256) public shares;

    // Permanently-locked shares minted on the first deposit, so totalShares can never be driven to a
    // tiny value that a force-donation could exploit to round later depositors' shares to zero.
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    event PerpEngineSet(address indexed perpEngine);
    event Deposited(address indexed who, uint256 ethIn, uint256 sharesOut);
    event Withdrawn(address indexed who, uint256 sharesIn, uint256 ethOut);
    event ProfitPaid(address indexed to, uint256 amount);
    event LossReceived(uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyPerp() {
        require(msg.sender == perpEngine, "only perp");
        _;
    }

    constructor(address owner_) {
        require(owner_ != address(0), "owner=0");
        owner = owner_;
    }

    function setPerpEngine(address perpEngine_) external onlyOwner {
        require(perpEngine == address(0), "perp set");
        require(perpEngine_ != address(0), "perp=0");
        perpEngine = perpEngine_;
        emit PerpEngineSet(perpEngine_);
    }

    function totalAssets() public view returns (uint256) {
        return address(this).balance;
    }

    /// @notice ETH the pool must retain to back open positions (queried from the engine).
    function lockedAssets() public view returns (uint256) {
        return perpEngine == address(0) ? 0 : IPerpEngine(perpEngine).lockedForPnl();
    }

    /// @notice Deposit ETH and mint shares proportional to existing assets.
    function deposit() external payable nonReentrant returns (uint256 sharesOut) {
        require(msg.value > 0, "no value");
        uint256 assetsBefore = address(this).balance - msg.value;
        if (totalShares == 0) {
            require(msg.value > MINIMUM_LIQUIDITY, "min liquidity");
            shares[DEAD] = MINIMUM_LIQUIDITY; // burn a floor of shares
            totalShares = MINIMUM_LIQUIDITY;
            sharesOut = msg.value - MINIMUM_LIQUIDITY;
        } else if (assetsBefore == 0) {
            sharesOut = msg.value;
        } else {
            sharesOut = (msg.value * totalShares) / assetsBefore;
        }
        require(sharesOut > 0, "zero shares");
        shares[msg.sender] += sharesOut;
        totalShares += sharesOut;
        emit Deposited(msg.sender, msg.value, sharesOut);
    }

    /// @notice Burn shares for a pro-rata slice of assets, subject to the utilization guard.
    function withdraw(uint256 sharesIn) external nonReentrant returns (uint256 ethOut) {
        require(sharesIn > 0 && shares[msg.sender] >= sharesIn, "bad shares");
        uint256 assets = address(this).balance;
        ethOut = (sharesIn * assets) / totalShares;
        require(assets - ethOut >= lockedAssets(), "utilization");

        shares[msg.sender] -= sharesIn;
        totalShares -= sharesIn;
        _sendValue(msg.sender, ethOut);
        emit Withdrawn(msg.sender, sharesIn, ethOut);
    }

    /// @inheritdoc ILiquidityPool
    function payTraderProfit(address to, uint256 amount) external onlyPerp nonReentrant {
        require(amount <= address(this).balance, "insufficient pool");
        _sendValue(to, amount);
        emit ProfitPaid(to, amount);
    }

    /// @inheritdoc ILiquidityPool
    function receiveLoss() external payable onlyPerp {
        emit LossReceived(msg.value);
    }

    /// @notice Share price scaled to 1e18 (assets per share).
    function sharePriceE18() external view returns (uint256) {
        if (totalShares == 0) return 1e18;
        return (address(this).balance * 1e18) / totalShares;
    }

    function _sendValue(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "ETH transfer failed");
    }
}
