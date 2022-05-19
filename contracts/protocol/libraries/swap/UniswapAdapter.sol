// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {ISwapRouter} from '../../../interfaces/ISwapRouter.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';
import {ILendingPoolAddressesProvider} from '../../../interfaces/ILendingPoolAddressesProvider.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {SafeMath} from '../../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';

library UniswapAdapter {
  using SafeMath for uint256;
  using PercentageMath for uint256;
  using SafeERC20 for IERC20;

  function swapExactTokensForTokens(
    ILendingPoolAddressesProvider addressesProvider,
    address assetToSwapFrom,
    address assetToSwapTo,
    uint256 amountToSwap,
    uint256 poolFee, // 1% = 10000
    uint256 slippage // 2% = 200
  ) external returns (uint256) {
    uint256 minAmountOut = _getMinAmount(
      addressesProvider,
      assetToSwapFrom,
      assetToSwapTo,
      amountToSwap,
      slippage
    );

    // Approves the transfer for the swap. Approves for 0 first to comply with tokens that implement the anti frontrunning approval fix.
    address UNISWAP_ROUTER = addressesProvider.getAddress('uniswapRouter');
    IERC20(assetToSwapFrom).safeApprove(address(UNISWAP_ROUTER), 0);
    IERC20(assetToSwapFrom).safeApprove(address(UNISWAP_ROUTER), amountToSwap);

    bool useEthPath = _useMultihopSwap(addressesProvider, assetToSwapFrom, amountToSwap);

    uint256 receivedAmount = 0;
    if (useEthPath) {
      ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
        path: abi.encodePacked(
          assetToSwapFrom,
          uint24(poolFee),
          addressesProvider.getAddress('WETH'),
          uint24(poolFee),
          assetToSwapTo
        ),
        recipient: address(this),
        deadline: block.timestamp,
        amountIn: amountToSwap,
        amountOutMinimum: minAmountOut
      });

      // Executes the swap.
      receivedAmount = ISwapRouter(UNISWAP_ROUTER).exactInput(params);
    } else {
      // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
      ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
        tokenIn: assetToSwapFrom,
        tokenOut: assetToSwapTo,
        fee: uint24(poolFee),
        recipient: address(this),
        deadline: block.timestamp,
        amountIn: amountToSwap,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0
      });

      // Executes the swap.
      receivedAmount = ISwapRouter(UNISWAP_ROUTER).exactInputSingle(params);
    }

    require(receivedAmount > 0, Errors.VT_SWAP_MISMATCH_RETURNED_AMOUNT);
    require(
      IERC20(assetToSwapTo).balanceOf(address(this)) >= receivedAmount,
      Errors.VT_SWAP_MISMATCH_RETURNED_AMOUNT
    );

    return receivedAmount;
  }

  function _getDecimals(address asset) internal view returns (uint256) {
    return IERC20Detailed(asset).decimals();
  }

  function _getPrice(ILendingPoolAddressesProvider addressesProvider, address asset)
    internal
    view
    returns (uint256)
  {
    return IPriceOracleGetter(addressesProvider.getPriceOracle()).getAssetPrice(asset);
  }

  function _getMinAmount(
    ILendingPoolAddressesProvider addressesProvider,
    address assetToSwapFrom,
    address assetToSwapTo,
    uint256 amountToSwap,
    uint256 slippage
  ) internal returns (uint256) {
    uint256 fromAssetDecimals = _getDecimals(assetToSwapFrom);
    uint256 toAssetDecimals = _getDecimals(assetToSwapTo);

    uint256 fromAssetPrice = _getPrice(addressesProvider, assetToSwapFrom);
    uint256 toAssetPrice = _getPrice(addressesProvider, assetToSwapTo);

    uint256 minAmountOut = amountToSwap
      .mul(fromAssetPrice.mul(10**toAssetDecimals))
      .div(toAssetPrice.mul(10**fromAssetDecimals))
      .percentMul(PercentageMath.PERCENTAGE_FACTOR.sub(slippage));

    return minAmountOut;
  }

  function _useMultihopSwap(
    ILendingPoolAddressesProvider addressesProvider,
    address _asset,
    uint256 _amount
  ) internal returns (bool) {
    address WETH = addressesProvider.getAddress('WETH');
    return _asset != WETH;
  }
}
