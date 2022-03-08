// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {GeneralVault} from './GeneralVault.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IYearnVault} from '../../interfaces/IYearnVault.sol';
import {IUniswapV2Router02} from '../../interfaces/IUniswapV2Router02.sol';
import {TransferHelper} from '../libraries/helpers/TransferHelper.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import {IERC20Detailed} from '../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../interfaces/IPriceOracleGetter.sol';

/**
 * @title YearnBOOVault
 * @notice yvBOO/BOO Vault by using Yearn on Fantom
 * @author Sturdy
 **/
contract YearnBOOVault is GeneralVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  function processYield() external override onlyAdmin {
    // Get yield from lendingPool
    address YVBOO = _addressesProvider.getAddress('YVBOO');
    uint256 yieldYVBOO = _getYield(YVBOO);

    // move yield to treasury
    if (_vaultFee > 0) {
      uint256 treasuryYVBOO = _processTreasury(yieldYVBOO);
      yieldYVBOO = yieldYVBOO.sub(treasuryYVBOO);
    }

    // Withdraw from Yearn Vault and receive BOO
    uint256 yieldBOO = IYearnVault(YVBOO).withdraw(yieldYVBOO, address(this), 1);

    AssetYield[] memory assetYields = _getAssetYields(yieldBOO);
    for (uint256 i = 0; i < assetYields.length; i++) {
      // BOO -> Asset and Deposit to pool
      if (assetYields[i].amount > 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }
  }

  function withdrawOnLiquidation(address _asset, uint256 _amount)
    external
    override
    returns (uint256)
  {
    address BOO = _addressesProvider.getAddress('BOO');

    require(_asset == BOO, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == _addressesProvider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    // Withdraw from Yearn Vault and receive BOO
    uint256 assetAmount = IYearnVault(_addressesProvider.getAddress('YVBOO')).withdraw(
      _amount,
      address(this),
      1
    );

    // Deliver BOO to user
    TransferHelper.safeTransfer(BOO, msg.sender, assetAmount);

    return assetAmount;
  }

  function _convertAndDepositYield(address _tokenOut, uint256 _booAmount) internal {
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');
    address BOO = _addressesProvider.getAddress('BOO');

    // Calculate minAmount from price with 2% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 minAmountFromPrice = _booAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('YVBOO')))
      .div(10**18)
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(_tokenOut))
      .percentMul(98_00);

    // Exchange BOO -> _tokenOut via UniswapV2
    address[] memory path = new address[](3);
    path[0] = BOO;
    path[1] = _addressesProvider.getAddress('WFTM');
    path[2] = _tokenOut;

    IERC20(BOO).approve(uniswapRouter, _booAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      _booAmount,
      minAmountFromPrice,
      path,
      address(this),
      block.timestamp
    );
    require(receivedAmounts[2] > 0, Errors.VT_PROCESS_YIELD_INVALID);
    require(
      IERC20(_tokenOut).balanceOf(address(this)) >= receivedAmounts[2],
      Errors.VT_PROCESS_YIELD_INVALID
    );

    // Make lendingPool to transfer required amount
    IERC20(_tokenOut).safeApprove(address(_addressesProvider.getLendingPool()), receivedAmounts[2]);
    // Deposit yield to pool
    _depositYield(_tokenOut, receivedAmounts[2]);
  }

  /**
   * @dev Get yield amount based on strategy
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(_addressesProvider.getAddress('YVBOO'));
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    return IYearnVault(_addressesProvider.getAddress('YVBOO')).pricePerShare();
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive yvBOO
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    address YVBOO = _addressesProvider.getAddress('YVBOO');
    address BOO = _addressesProvider.getAddress('BOO');

    // receive BOO from user
    require(_asset == BOO, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    TransferHelper.safeTransferFrom(BOO, msg.sender, address(this), _amount);

    // Deposit BOO to Yearn Vault and receive yvBOO
    IERC20(BOO).approve(YVBOO, _amount);
    uint256 assetAmount = IYearnVault(YVBOO).deposit(_amount, address(this));

    // Make lendingPool to transfer required amount
    IERC20(YVBOO).approve(address(_addressesProvider.getLendingPool()), assetAmount);
    return (YVBOO, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of yvBOO based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (_addressesProvider.getAddress('YVBOO'), _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with yvBOO and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override {
    address YVBOO = _addressesProvider.getAddress('YVBOO');
    address BOO = _addressesProvider.getAddress('BOO');

    require(_asset == BOO, Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    // Withdraw from Yearn Vault and receive BOO
    uint256 assetAmount = IYearnVault(YVBOO).withdraw(_amount, address(this), 1);

    // Deliver BOO to user
    TransferHelper.safeTransfer(BOO, _to, assetAmount);
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('YVBOO')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
