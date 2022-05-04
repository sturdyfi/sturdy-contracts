// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {GeneralVault} from '../../GeneralVault.sol';
import {IERC20} from '../../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {SafeERC20} from '../../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {IERC20Detailed} from '../../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IConvexBooster} from '../../../../interfaces/IConvexBooster.sol';
import {IConvexBaseRewardPool} from '../../../../interfaces/IConvexBaseRewardPool.sol';
import {ICurvePool} from '../../../../interfaces/ICurvePool.sol';
import {ISwapRouter} from '../../../../interfaces/ISwapRouter.sol';
import {TransferHelper} from '../../../libraries/helpers/TransferHelper.sol';
import {Errors} from '../../../libraries/helpers/Errors.sol';
import {SafeMath} from '../../../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {PercentageMath} from '../../../libraries/math/PercentageMath.sol';
import {IPriceOracleGetter} from '../../../../interfaces/IPriceOracleGetter.sol';
import {SturdyInternalAsset} from '../../../tokenization/SturdyInternalAsset.sol';

/**
 * @title ConvexCurveLPVault
 * @notice Curve LP Token Vault by using Convex on Ethereum
 * @author Sturdy
 **/
contract ConvexCurveLPVault is GeneralVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  address public convexBooster;
  address internal curveLPToken;
  address internal internalAssetToken;
  uint256 internal convexPoolId;

  /**
   * @dev Receive Ether
   */
  receive() external payable {}

  /**
   * @dev The function to set parameters related to convex/curve
   * @param _lpToken The address of Curve LP Token which will be used in vault
   * @param _poolId  The convex pool Id for Curve LP Token
   */
  function setConfiguration(address _lpToken, uint256 _poolId) external onlyAdmin {
    require(internalAssetToken == address(0), Errors.VT_INVALID_CONFIGURATION);

    convexBooster = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;
    curveLPToken = _lpToken;
    convexPoolId = _poolId;
    SturdyInternalAsset _interalToken = new SturdyInternalAsset(
      string(abi.encodePacked('Sturdy ', IERC20Detailed(_lpToken).symbol())),
      string(abi.encodePacked('c', IERC20Detailed(_lpToken).symbol())),
      IERC20Detailed(_lpToken).decimals()
    );
    internalAssetToken = address(_interalToken);
  }

  /**
   * @dev The function to get internal asset address
   */
  function getInternalAsset() external view returns (address) {
    return internalAssetToken;
  }

  /**
   * @dev The function to get rewards token address
   */
  function getCrvRewards() internal view returns (address) {
    IConvexBooster.PoolInfo memory poolInfo = IConvexBooster(convexBooster).poolInfo(convexPoolId);
    return poolInfo.crvRewards;
  }

  function processYield() external override onlyAdmin {
    address CRV = _addressesProvider.getAddress('CRV');
    address crvRewards = getCrvRewards();

    IConvexBaseRewardPool(crvRewards).getReward();
    uint256 yieldCRV = IERC20(CRV).balanceOf(address(this));

    if (_vaultFee > 0) {
      uint256 treasuryCRV = _processTreasury(yieldCRV);
      yieldCRV = yieldCRV.sub(treasuryCRV);
    }

    // transfer CRV to yieldManager
    address yieldManager = _addressesProvider.getAddress('YIELD_MANAGER');
    TransferHelper.safeTransfer(CRV, yieldManager, yieldCRV);

    // AssetYield[] memory assetYields = _getAssetYields(yieldCRV);
    // for (uint256 i = 0; i < assetYields.length; i++) {
    //   // CRV -> Asset and Deposit to pool
    //   if (assetYields[i].amount > 0) {
    //     _convertCRVToStableCoin(assetYields[i].asset, assetYields[i].amount);
    //   }
    // }

    emit ProcessYield(CRV, yieldCRV);
  }

  /**
   * @dev Exchange stETH -> ETH via Curve
   * @param _fromAsset address of stETH
   * @param _fromAmount amount of stETH
   */
  function _convertAssetByCurve(address _fromAsset, uint256 _fromAmount)
    internal
    returns (uint256)
  {
    // Exchange stETH -> ETH via curve
    address CurveswapLidoPool = _addressesProvider.getAddress('CurveswapLidoPool');
    IERC20(_fromAsset).safeApprove(CurveswapLidoPool, _fromAmount);
    uint256 minAmount = ICurvePool(CurveswapLidoPool).get_dy(1, 0, _fromAmount);

    // Calculate minAmount from price with 1% slippage
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 assetPrice = oracle.getAssetPrice(_fromAsset);
    uint256 minAmountFromPrice = _fromAmount.percentMul(99_00).mul(assetPrice).div(10**18);

    if (minAmountFromPrice < minAmount) minAmount = minAmountFromPrice;

    uint256 receivedAmount = ICurvePool(CurveswapLidoPool).exchange(1, 0, _fromAmount, minAmount);
    return receivedAmount;
  }

  // /**
  //  * @dev Convert WETH to Stable coins using UniSwap
  //  * @param _tokenOut address of stable coin
  //  * @param _wethAmount amount of WETH
  //  * @param _isDeposit flag if it should be deposited to Lending Pool
  //  */
  // function _convertWETHAndDepositYield(
  //   address _tokenOut,
  //   uint256 _wethAmount,
  //   bool _isDeposit
  // ) internal {
  //   // Approve the uniswapRouter to spend WETH.
  //   address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');
  //   address WETH = _addressesProvider.getAddress('WETH');
  //   TransferHelper.safeApprove(WETH, uniswapRouter, _wethAmount);

  //   // Calculate minAmount from price with 1% slippage
  //   uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
  //   IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
  //   uint256 assetPrice = oracle.getAssetPrice(_tokenOut);
  //   uint256 minAmountFromPrice = _wethAmount.div(assetPrice).percentMul(99_00).mul(
  //     10**assetDecimal
  //   );

  //   // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
  //   // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.

  //   // uniswap pool fee to 0.05%.
  //   uint24 uniswapFee = 500;

  //   ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
  //     tokenIn: WETH,
  //     tokenOut: _tokenOut,
  //     fee: uniswapFee,
  //     recipient: address(this),
  //     deadline: block.timestamp,
  //     amountIn: _wethAmount,
  //     amountOutMinimum: minAmountFromPrice,
  //     sqrtPriceLimitX96: 0
  //   });

  //   // Exchange WETH -> _tokenOut via UniswapV3
  //   uint256 receivedAmount = ISwapRouter(uniswapRouter).exactInputSingle(params);
  //   require(receivedAmount > 0, Errors.VT_PROCESS_YIELD_INVALID);
  //   require(
  //     IERC20(_tokenOut).balanceOf(address(this)) >= receivedAmount,
  //     Errors.VT_PROCESS_YIELD_INVALID
  //   );

  //   if (_isDeposit) {
  //     // Make lendingPool to transfer required amount
  //     IERC20(_tokenOut).safeApprove(address(_addressesProvider.getLendingPool()), receivedAmount);
  //     // Deposit Yield to pool
  //     _depositYield(_tokenOut, receivedAmount);
  //   } else {
  //     TransferHelper.safeTransfer(_tokenOut, msg.sender, receivedAmount);
  //   }
  // }

  // /**
  //  * @dev Calculate Amount from price with 5% slippage
  //  */
  // function _calcAmountFromPrice(
  //   address _tokenIn,
  //   uint256 _amountIn,
  //   address _tokenOut
  // ) internal returns (uint256 minAmount) {
  //   IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
  //   uint256 inDecimals = IERC20Detailed(_tokenIn).decimals();
  //   uint256 outDecimals = IERC20Detailed(_tokenOut).decimals();
  //   minAmount = _amountIn.mul(oracle.getAssetPrice(_tokenIn)).mul(10**outDecimals).div(
  //     oracle.getAssetPrice(_tokenOut)
  //   );
  //   minAmount = minAmount.percentMul(95_00).div(10**inDecimals);
  // }

  // /**
  //  * @dev Convert CRV to Stable coin using 1inch
  //  * @param _tokenOut address of stable coin
  //  * @param _crvAmount amount of CRV token
  //  */
  // function _convertCRVToStableCoin(address _tokenOut, uint256 _crvAmount) internal {
  //   // Approve the uniswapRouter to spend CRV.
  //   address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');
  //   address CRV = _addressesProvider.getAddress('CRV');
  //   address WETH = _addressesProvider.getAddress('WETH');
  //   TransferHelper.safeApprove(CRV, uniswapRouter, _crvAmount);

  //   uint256 minAmountFromPrice = _calcAmountFromPrice(CRV, _crvAmount, _tokenOut);

  //   uint24 poolFee = 3000; // 0.3%
  //   ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
  //     path: abi.encodePacked(CRV, poolFee, WETH, poolFee, _tokenOut),
  //     recipient: address(this),
  //     deadline: block.timestamp,
  //     amountIn: _crvAmount,
  //     amountOutMinimum: minAmountFromPrice
  //   });

  //   // Exchange CRV -> _tokenOut via UniswapV3
  //   uint256 receivedAmount = ISwapRouter(uniswapRouter).exactInput(params);
  //   require(receivedAmount > 0, Errors.VT_PROCESS_YIELD_INVALID);
  //   require(
  //     IERC20(_tokenOut).balanceOf(address(this)) >= receivedAmount,
  //     Errors.VT_PROCESS_YIELD_INVALID
  //   );

  //   // Make lendingPool to transfer required amount
  //   IERC20(_tokenOut).safeApprove(address(_addressesProvider.getLendingPool()), receivedAmount);
  //   // Deposit Yield to pool
  //   _depositYield(_tokenOut, receivedAmount);
  // }

  /**
   * @dev Get yield amount based on strategy
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(internalAssetToken);
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    uint256 decimals = IERC20Detailed(internalAssetToken).decimals();
    return 10**decimals;
  }

  /**
   * @dev Deposit to yield pool based on strategy and mint internal asset
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    // receive Curve LP Token from user
    require(_asset == curveLPToken, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    TransferHelper.safeTransferFrom(curveLPToken, msg.sender, address(this), _amount);

    // Deposit Curve LP Token to Convex
    IERC20(curveLPToken).approve(convexBooster, _amount);
    IConvexBooster(convexBooster).deposit(convexPoolId, _amount, true);

    // mint
    SturdyInternalAsset(internalAssetToken).mint(address(this), _amount);
    IERC20(internalAssetToken).approve(address(_addressesProvider.getLendingPool()), _amount);

    return (internalAssetToken, _amount);
  }

  /**
   * @dev Get Withdrawal amount of Curve LP Token based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (internalAssetToken, _amount);
  }

  function _withdraw(uint256 _amount, address _to) internal returns (uint256) {
    address crvRewards = getCrvRewards();

    // Get Reward before withdraw
    IConvexBaseRewardPool(crvRewards).getReward();

    // Withdraw from Convex
    IConvexBaseRewardPool(crvRewards).withdrawAndUnwrap(_amount, true);

    // Deliver Curve LP Token
    TransferHelper.safeTransfer(curveLPToken, _to, _amount);

    // Burn
    SturdyInternalAsset(internalAssetToken).burn(address(this), _amount);

    return _amount;
  }

  function withdrawOnLiquidation(address _asset, uint256 _amount)
    external
    override
    returns (uint256)
  {
    require(_asset == curveLPToken, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == _addressesProvider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    return _withdraw(_amount, msg.sender);
  }

  /**
   * @dev Withdraw from yield pool based on strategy and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override returns (uint256) {
    require(_asset == curveLPToken, Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    return _withdraw(_amount, _to);
  }

  /**
   * @dev Move some yield(CRV) to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('CRV')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
