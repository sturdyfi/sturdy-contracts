// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';
import {ICurveAddressProvider} from '../../../interfaces/ICurveAddressProvider.sol';
import {ICurveExchange} from '../../../interfaces/ICurveExchange.sol';
import {ILendingPoolAddressesProvider} from '../../../interfaces/ILendingPoolAddressesProvider.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {SafeMath} from '../../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';

library CurveswapAdapter {
  using SafeMath for uint256;
  using PercentageMath for uint256;
  using SafeERC20 for IERC20;

  function swapExactTokensForTokens(
    ILendingPoolAddressesProvider addressesProvider,
    address poolAddress,
    address assetToSwapFrom,
    address assetToSwapTo,
    uint256 amountToSwap,
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
    address curveAddressProvider = addressesProvider.getAddress('CURVE_ADDRESS_PROVIDER');
    address curveExchange = ICurveAddressProvider(curveAddressProvider).get_address(2);

    IERC20(assetToSwapFrom).safeApprove(address(curveExchange), 0);
    IERC20(assetToSwapFrom).safeApprove(address(curveExchange), amountToSwap);

    uint256 receivedAmount = ICurveExchange(curveExchange).exchange(
      poolAddress,
      assetToSwapFrom,
      assetToSwapTo,
      amountToSwap,
      minAmountOut,
      address(this)
    );

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
}
