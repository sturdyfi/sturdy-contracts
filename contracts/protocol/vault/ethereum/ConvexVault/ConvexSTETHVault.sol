// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {ConvexCurveLPVault} from './ConvexCurveLPVault.sol';
import {IERC20} from '../../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {ICurvePool} from '../../../../interfaces/ICurvePool.sol';
import {IWstETH} from '../../../../interfaces/IWstETH.sol';
import {IWETH} from '../../../../misc/interfaces/IWETH.sol';
import {TransferHelper} from '../../../libraries/helpers/TransferHelper.sol';
import {Errors} from '../../../libraries/helpers/Errors.sol';
import {SafeMath} from '../../../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {SafeERC20} from '../../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../../libraries/math/PercentageMath.sol';
import {IERC20Detailed} from '../../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../../../interfaces/IPriceOracleGetter.sol';

/**
 * @title ConvexSTETHVault
 * @notice Curve steth pool Vault by using Convex on Ethereum
 * @author Sturdy
 **/
contract ConvexSTETHVault is ConvexCurveLPVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  address internal curveStableSwap;

  /**
   * @dev The function to set stableswap for lp token
   */
  function setCurveStableSwap(address _address) external onlyAdmin {
    curveStableSwap = _address;
  }

  // /**
  //  * @dev convert curve lp token to WETH
  //  * @param _assetOut WETH address
  //  * @param _amountIn amount of lp token
  //  */
  // function convertOnLiquidation(address _assetOut, uint256 _amountIn) external override {
  //   require(
  //     msg.sender == _addressesProvider.getAddress('LIQUIDATOR'),
  //     Errors.LP_LIQUIDATION_CONVERT_FAILED
  //   );

  //   // Withdraw a single asset(ETH) from the pool
  //   uint256 _amount = _withdrawFromCurvePool(_amountIn);

  //   // ETH -> WETH
  //   address weth = _addressesProvider.getAddress('WETH');
  //   IWETH(weth).deposit{value: _amount}();

  //   TransferHelper.safeTransfer(weth, msg.sender, _amount);
  // }

  // /**
  //  * @dev The function to withdraw a single asset(ETH) from Curve Pool(ETH+stETH)
  //  * @param _amount amount of LP token
  //  * @return amountETH amount of ETH to receive
  //  */
  // function _withdrawFromCurvePool(uint256 _amount) internal returns (uint256 amountETH) {
  //   require(curveStableSwap != address(0), Errors.VT_INVALID_CONFIGURATION);

  //   int128 _underlying_coin_index = 0; // ETH
  //   uint256 _minAmount = ICurvePool(curveStableSwap).calc_withdraw_one_coin(
  //     _amount,
  //     _underlying_coin_index
  //   );
  //   amountETH = ICurvePool(curveStableSwap).remove_liquidity_one_coin(
  //     _amount,
  //     _underlying_coin_index,
  //     _minAmount
  //   );
  // }
}
