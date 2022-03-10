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
 * @title YearnWBTCVault
 * @notice yvWBTC/WBTC Vault by using Yearn on Fantom
 * @author Sturdy
 **/
contract YearnWBTCVault is GeneralVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  function processYield() external override onlyAdmin {
    // Get yield from lendingPool
    address YVWBTC = _addressesProvider.getAddress('YVWBTC');
    uint256 yieldYVWBTC = _getYield(YVWBTC);

    // move yield to treasury
    if (_vaultFee > 0) {
      uint256 treasuryYVWBTC = _processTreasury(yieldYVWBTC);
      yieldYVWBTC = yieldYVWBTC.sub(treasuryYVWBTC);
    }

    // Withdraw from Yearn Vault and receive WBTC
    uint256 yieldWBTC = IYearnVault(YVWBTC).withdraw(yieldYVWBTC, address(this), 1);

    AssetYield[] memory assetYields = _getAssetYields(yieldWBTC);
    for (uint256 i = 0; i < assetYields.length; i++) {
      // WBTC -> Asset and Deposit to pool
      if (assetYields[i].amount > 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }

    emit ProcessYield(_addressesProvider.getAddress('WBTC'), yieldWBTC);
  }

  function withdrawOnLiquidation(address _asset, uint256 _amount)
    external
    override
    returns (uint256)
  {
    address WBTC = _addressesProvider.getAddress('WBTC');

    require(_asset == WBTC, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == _addressesProvider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    // Withdraw from Yearn Vault and receive WBTC
    uint256 assetAmount = IYearnVault(_addressesProvider.getAddress('YVWBTC')).withdraw(
      _amount,
      address(this),
      1
    );

    // Deliver WBTC to user
    TransferHelper.safeTransfer(WBTC, msg.sender, assetAmount);

    return assetAmount;
  }

  function _convertAndDepositYield(address _tokenOut, uint256 _wbtcAmount) internal {
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');
    address WBTC = _addressesProvider.getAddress('WBTC');

    // Calculate minAmount from price with 2% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 minAmountFromPrice = _wbtcAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('YVWBTC')))
      .div(10**8)
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(_tokenOut))
      .percentMul(98_00);

    // Exchange WBTC -> _tokenOut via UniswapV2
    address[] memory path = new address[](3);
    path[0] = WBTC;
    path[1] = _addressesProvider.getAddress('WFTM');
    path[2] = _tokenOut;

    IERC20(WBTC).approve(uniswapRouter, _wbtcAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      _wbtcAmount,
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
    return _getYieldAmount(_addressesProvider.getAddress('YVWBTC'));
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    return IYearnVault(_addressesProvider.getAddress('YVWBTC')).pricePerShare();
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive yvWBTC
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    address YVWBTC = _addressesProvider.getAddress('YVWBTC');
    address WBTC = _addressesProvider.getAddress('WBTC');

    // Case of WBTC deposit from user, receive WBTC from user
    require(_asset == WBTC, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    TransferHelper.safeTransferFrom(WBTC, msg.sender, address(this), _amount);

    // Deposit WBTC to Yearn Vault and receive yvWBTC
    IERC20(WBTC).approve(YVWBTC, _amount);
    uint256 assetAmount = IYearnVault(YVWBTC).deposit(_amount, address(this));

    // Make lendingPool to transfer required amount
    IERC20(YVWBTC).approve(address(_addressesProvider.getLendingPool()), assetAmount);
    return (YVWBTC, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of yvWBTC based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (_addressesProvider.getAddress('YVWBTC'), _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with yvWBTC and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override {
    address YVWBTC = _addressesProvider.getAddress('YVWBTC');
    address WBTC = _addressesProvider.getAddress('WBTC');

    // Withdraw from Yearn Vault and receive WBTC
    uint256 assetAmount = IYearnVault(YVWBTC).withdraw(_amount, address(this), 1);

    require(_asset == WBTC, Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    // Deliver WBTC to user
    TransferHelper.safeTransfer(WBTC, _to, assetAmount);
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('YVWBTC')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
