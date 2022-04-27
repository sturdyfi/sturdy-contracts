// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {ConvexCurveLPVault} from './ConvexCurveLPVault.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {ICurvePool} from '../../../interfaces/ICurvePool.sol';
import {IWstETH} from '../../../interfaces/IWstETH.sol';
import {IWETH} from '../../../misc/interfaces/IWETH.sol';
import {TransferHelper} from '../../libraries/helpers/TransferHelper.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {SafeMath} from '../../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';

/**
 * @title ConvexRocketPoolETHVault
 * @notice Curve RocketPoolETH pool Vault by using Convex on Ethereum
 * @author Sturdy
 **/
contract ConvexRocketPoolETHVault is ConvexCurveLPVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  /**
   * @dev convert curve lp token to stable coin
   * @param _assetOut address of stable coin
   * @param _amountIn amount of lp token
   */
  function convertOnLiquidation(address _assetOut, uint256 _amountIn) external override {
    require(
      msg.sender == _addressesProvider.getAddress('Liquidator'),
      Errors.LP_LIQUIDATION_CONVERT_FAILED
    );

    // Withdraw rETHwstETH-f from curve finance pool and receive wstETH
    uint256 wstETHAmount = _withdrawLiquidityPool(_amountIn);

    // Unwrap wstETH and receive stETH
    uint256 stETHAmount = IWstETH(_addressesProvider.getAddress('WSTETH')).unwrap(wstETHAmount);

    // Exchange stETH -> ETH via Curve
    uint256 receivedETHAmount = _convertAssetByCurve(
      _addressesProvider.getAddress('LIDO'),
      stETHAmount
    );
    // ETH -> WETH
    IWETH(_addressesProvider.getAddress('WETH')).deposit{value: receivedETHAmount}();

    // WETH -> Asset
    _convertWETHAndDepositYield(_assetOut, receivedETHAmount, false);
  }

  function _withdrawLiquidityPool(uint256 _amount) internal returns (uint256 amountWstETH) {
    uint256 minWstETHAmount = ICurvePool(curveLPToken).calc_withdraw_one_coin(_amount, 1, false);
    amountWstETH = ICurvePool(curveLPToken).remove_liquidity_one_coin(
      _amount,
      1,
      minWstETHAmount,
      address(this)
    );
  }
}
