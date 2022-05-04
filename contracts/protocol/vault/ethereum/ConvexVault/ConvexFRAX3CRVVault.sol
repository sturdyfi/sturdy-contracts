// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {ConvexCurveLPVault} from './ConvexCurveLPVault.sol';
import {IERC20} from '../../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {ICurvePool} from '../../../../interfaces/ICurvePool.sol';
import {ICurveSwap} from '../../../../interfaces/ICurveSwap.sol';
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
 * @title ConvexFRAX3CRVVault
 * @notice Curve FRAX pool Vault by using Convex on Ethereum
 * @author Sturdy
 **/
contract ConvexFRAX3CRVVault is ConvexCurveLPVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  address internal curve3PoolSwap;
  mapping(address => uint256) internal poolCoins;

  function setCurve3PoolSwap(address _address) external onlyAdmin {
    curve3PoolSwap = _address;
    poolCoins[ICurveSwap(_address).coins(0)] = 0;
    poolCoins[ICurveSwap(_address).coins(1)] = 1;
    poolCoins[ICurveSwap(_address).coins(2)] = 2;
  }

  /**
   * @dev convert curve lp token to 3CRV
   * @param _amountIn amount of lp token
   */
  function convertOnLiquidation(uint256 _amountIn) external override {
    require(
      msg.sender == _addressesProvider.getAddress('LIQUIDATOR'),
      Errors.LP_LIQUIDATION_CONVERT_FAILED
    );

    // Withdraw a single asset(3CRV) from the pool
    uint256 _amount = _withdrawFromCurvePool(_amountIn);

    // // Swap 3CRV to asset
    // _amount = _swap3CRV(_assetOut, _amount);

    // // Transfer asset to liquidator
    // TransferHelper.safeTransfer(_assetOut, msg.sender, _amount);

    address threeCRV = ICurveSwap(curve3PoolSwap).coins(1); // 3CRV
    TransferHelper.safeTransfer(threeCRV, msg.sender, _amount);
  }

  /**
   * @dev The function to withdraw a single asset(3CRv) from Curve Pool(FRAX+3CRV)
   * @param _amount amount of LP token
   * @return amount3CRV amount of 3CRV to receive
   */
  function _withdrawFromCurvePool(uint256 _amount) internal returns (uint256 amount3CRV) {
    int128 _underlying_coin_index = 1; // 3CRV
    uint256 _minAmount = ICurvePool(curveLPToken).calc_withdraw_one_coin(
      _amount,
      _underlying_coin_index,
      false
    );
    amount3CRV = ICurvePool(curveLPToken).remove_liquidity_one_coin(
      _amount,
      _underlying_coin_index,
      _minAmount,
      address(this)
    );
  }

  // /**
  //  * @dev The function to swap 3CRV to stable asset(eg. DAI, USDC)
  //  * @param _assetOut address of stable asset
  //  * @param _amount amount of 3CRV
  //  * @return assetAmount amount of the stable asset received
  //  */
  // function _swap3CRV(address _assetOut, uint256 _amount) internal returns (uint256 assetAmount) {
  //   require(curve3PoolSwap != address(0), Errors.VT_INVALID_CONFIGURATION);
  //   uint256 _coin_index = poolCoins[_assetOut];
  //   require(
  //     ICurveSwap(curve3PoolSwap).coins(_coin_index) == _assetOut,
  //     Errors.VT_LIQUIDITY_DEPOSIT_INVALID
  //   );
  //   uint256 _minAmount = ICurveSwap(curve3PoolSwap).calc_withdraw_one_coin(
  //     _amount,
  //     int128(_coin_index)
  //   );

  //   uint256 balanceBefore = IERC20(_assetOut).balanceOf(address(this));
  //   ICurveSwap(curve3PoolSwap).remove_liquidity_one_coin(_amount, int128(_coin_index), _minAmount);
  //   assetAmount = IERC20(_assetOut).balanceOf(address(this)).sub(balanceBefore);
  // }
}
