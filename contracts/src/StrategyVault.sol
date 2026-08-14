// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Uniswap v4 StateView — current pool price for the on-chain min-out guard.
interface IStateView {
    function getSlot0(bytes32 poolId)
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee);
}

/// @notice HarvestFi PerpEngine (subset the vault needs).
interface IPerpEngine {
    struct Position {
        address trader;
        uint256 commodityId;
        bool isLong;
        uint256 collateral;
        uint256 sizeEth;
        uint256 entryPrice;
        int256 entryFundingIndex;
        uint256 entryBorrowingIndex;
        uint64 openedAt;
    }

    function openPosition(uint256 commodityId, bool isLong, uint16 leverageX, uint256 maxSlippagePrice)
        external
        payable
        returns (uint256 positionId);
    function closePosition(uint256 positionId, uint256 maxSlippagePrice) external;
    function unrealizedPnl(uint256 positionId) external view returns (int256);
    function getPosition(uint256 positionId) external view returns (Position memory);
    function withdraw() external returns (uint256);
}

/// @notice pools.trade creator-fee vault (holds the beneficiary NFT; the vault claims ETH+token fees).
interface IBeneficiaryVault {
    function ownerOf(uint256 tokenId) external view returns (address);
    function claim(uint256 tokenId, uint256 minCurrency0Amount, uint256 minCurrency1Amount) external;
}

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IERC20Min {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title StrategyVault
/// @notice One per "strategy coin". Holds the coin's creator-fee NFT, claims fees, and runs a leveraged
///         long/short on the paired commodity market via the HarvestFi PerpEngine. When a position hits
///         the take-profit (or stop-loss), it closes and uses the payout to BUY the coin on its Uniswap
///         v4 pool and BURN it. Direction, leverage, and thresholds are immutable (set at launch).
///
///         Ownerless: there is no admin, no withdraw. ETH only leaves as perp collateral, the buy-and-burn
///         swap, or the small permissionless caller bounty. Marketing == code, same discipline as the Sweeper.
///
///         v1: buy-and-burn min-out is caller-supplied; an on-chain StateView spot guard is a hardening
///         follow-up before real funds. Prices are simulated for now (PnL is against the sim oracle).
contract StrategyVault {
    // --- immutable config ---
    IPerpEngine public immutable perpEngine;
    IBeneficiaryVault public immutable beneficiaryVault;
    IUniversalRouter public immutable router;
    IStateView public immutable stateView;
    address public immutable token; // the launched coin (Uniswap v4 currency1; currency0 = ETH)
    uint256 public immutable positionNftId; // creator-fee NFT id (== pools.trade position id)
    uint256 public immutable marketId; // commodity market this coin trades
    bool public immutable isLong;
    uint16 public immutable leverageX;
    uint256 public immutable openThresholdWei; // open once the ETH pot reaches this (~$50)
    uint256 public immutable takeProfitBps; // close in profit at pnl >= collateral * tp / 1e4 (2x = 10000)
    uint256 public immutable stopLossBps; // close to cap loss at pnl <= -collateral * sl / 1e4
    uint16 public immutable bountyBps; // caller bounty on a successful buy-and-burn crank (<= 2000)
    uint16 public immutable maxSlippageBps; // buy-and-burn slippage cap vs the pool spot (<= 3000)

    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    // v4: currency0=ETH(0), currency1=token, fee 2500, tickSpacing 25, no hook (pools.trade graduated pool).
    uint24 internal constant POOL_FEE = 2500;
    int24 internal constant POOL_TICK_SPACING = 25;
    bytes1 internal constant V4_SWAP = 0x10;
    bytes internal constant ACTIONS = hex"060c0f"; // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL

    // --- state ---
    uint256 public openPositionId; // 0 = no open position
    uint256 public totalBurned; // cumulative coin burned
    uint256 public cycles; // completed open->close->burn cycles

    event Harvested(uint256 ethIn);
    event Opened(uint256 indexed positionId, uint256 collateral);
    event Closed(uint256 indexed positionId, int256 pnl, uint256 payout);
    event BoughtAndBurned(uint256 ethSpent, uint256 tokenBurned, address indexed caller, uint256 bounty);

    struct Config {
        address perpEngine;
        address beneficiaryVault;
        address router;
        address stateView;
        address token;
        uint256 positionNftId;
        uint256 marketId;
        bool isLong;
        uint16 leverageX;
        uint256 openThresholdWei;
        uint256 takeProfitBps;
        uint256 stopLossBps;
        uint16 bountyBps;
        uint16 maxSlippageBps;
    }

    constructor(Config memory c) {
        require(
            c.perpEngine != address(0) && c.beneficiaryVault != address(0) && c.router != address(0)
                && c.stateView != address(0) && c.token != address(0),
            "zero"
        );
        require(c.leverageX >= 1, "bad params");
        require(
            c.bountyBps <= 2000 && c.stopLossBps <= 10000 && c.takeProfitBps >= 1 && c.maxSlippageBps <= 3000,
            "bad thresholds"
        );
        perpEngine = IPerpEngine(c.perpEngine);
        beneficiaryVault = IBeneficiaryVault(c.beneficiaryVault);
        router = IUniversalRouter(c.router);
        stateView = IStateView(c.stateView);
        token = c.token;
        positionNftId = c.positionNftId;
        marketId = c.marketId;
        isLong = c.isLong;
        leverageX = c.leverageX;
        openThresholdWei = c.openThresholdWei;
        takeProfitBps = c.takeProfitBps;
        stopLossBps = c.stopLossBps;
        bountyBps = c.bountyBps;
        maxSlippageBps = c.maxSlippageBps;
    }

    receive() external payable {}

    /// @dev Accept the beneficiary NFT (ERC721 safeTransfer parks the fee stream here permanently).
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /// @notice Pull accrued creator fees (ETH side) into the vault. Permissionless.
    function harvest() public {
        beneficiaryVault.claim(positionNftId, 0, 0);
        // token-side fees (if any) are swept on the next burn; ETH grows the pot.
        emit Harvested(address(this).balance);
    }

    /// @notice Open the leveraged position once the pot is large enough and none is open. Permissionless.
    function open(uint256 maxSlippagePrice) external {
        require(openPositionId == 0, "position open");
        uint256 collateral = address(this).balance;
        require(collateral >= openThresholdWei, "below threshold");
        openPositionId = perpEngine.openPosition{value: collateral}(marketId, isLong, leverageX, maxSlippagePrice);
        emit Opened(openPositionId, collateral);
    }

    /// @notice If the open position hit take-profit or stop-loss, close it and buy+burn with the payout.
    ///         Permissionless; the buy-and-burn min-out is computed on-chain from the pool spot.
    function manage(uint256 maxSlippagePrice) external {
        uint256 id = openPositionId;
        require(id != 0, "no position");
        IPerpEngine.Position memory pos = perpEngine.getPosition(id);
        int256 pnl = perpEngine.unrealizedPnl(id);
        int256 tp = int256((pos.collateral * takeProfitBps) / 10000);
        int256 sl = -int256((pos.collateral * stopLossBps) / 10000);
        require(pnl >= tp || pnl <= sl, "not at target");

        uint256 before = address(this).balance;
        perpEngine.closePosition(id, maxSlippagePrice);
        // payout is pushed to this vault; if the push failed it sits in owed -> withdraw it.
        try perpEngine.withdraw() {} catch {}
        openPositionId = 0;
        uint256 payout = address(this).balance - before;
        emit Closed(id, pnl, payout);

        _buyAndBurn(msg.sender);
        cycles += 1;
    }

    /// @dev Buy the coin on its v4 pool with the whole ETH balance and burn it; pay the caller a bounty.
    ///      Min-out is derived from the pool's live spot price (StateView) so a caller cannot force a
    ///      zero-slippage sandwich.
    function _buyAndBurn(address caller) internal {
        uint256 potBal = address(this).balance;
        if (potBal == 0) return;
        uint256 bounty = (potBal * bountyBps) / 10000;
        uint256 spend = potBal - bounty;
        if (spend == 0) return;

        uint256 mo = _minOut(spend);
        uint128 minOut = mo > type(uint128).max ? type(uint128).max : uint128(mo);

        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            ExactInputSingleParams({
                poolKey: _poolKey(),
                zeroForOne: true, // ETH (currency0) -> token (currency1)
                amountIn: uint128(spend),
                amountOutMinimum: minOut,
                hookData: bytes("")
            })
        );
        params[1] = abi.encode(address(0), spend); // SETTLE_ALL: pay ETH
        params[2] = abi.encode(token, uint256(minOut)); // TAKE_ALL: receive token
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(ACTIONS, params);
        router.execute{value: spend}(abi.encodePacked(V4_SWAP), inputs, block.timestamp + 300);

        uint256 bal = IERC20Min(token).balanceOf(address(this));
        require(bal > 0, "no token out");
        IERC20Min(token).transfer(DEAD, bal);
        totalBurned += bal;

        if (bounty > 0) {
            (bool ok,) = payable(caller).call{value: bounty}("");
            require(ok, "bounty");
        }
        emit BoughtAndBurned(spend, bal, caller, bounty);
    }

    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct ExactInputSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        bytes hookData;
    }

    function _poolKey() internal view returns (PoolKey memory) {
        return PoolKey(address(0), token, POOL_FEE, POOL_TICK_SPACING, address(0));
    }

    /// @notice v4 poolId for this coin (ETH/token/2500/25/no-hook).
    function poolId() public view returns (bytes32) {
        return keccak256(abi.encode(_poolKey()));
    }

    /// @dev Expected token-out at the pool's live spot, minus the slippage cap. currency0=ETH,
    ///      currency1=token, so spot token-per-ETH = (sqrtP / 2^96)^2. Two mulDivs avoid overflow.
    function _minOut(uint256 ethIn) internal view returns (uint256) {
        (uint160 sqrtP,,,) = stateView.getSlot0(poolId());
        uint256 q96 = 1 << 96;
        uint256 half = Math.mulDiv(ethIn, uint256(sqrtP), q96);
        uint256 expected = Math.mulDiv(half, uint256(sqrtP), q96);
        return (expected * (10000 - maxSlippageBps)) / 10000;
    }

    // --- views ---
    function pot() external view returns (uint256) {
        return address(this).balance;
    }

    function currentPnl() external view returns (int256) {
        return openPositionId == 0 ? int256(0) : perpEngine.unrealizedPnl(openPositionId);
    }
}
