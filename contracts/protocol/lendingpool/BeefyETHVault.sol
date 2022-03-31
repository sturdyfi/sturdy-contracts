// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {GeneralVault} from './GeneralVault.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IBeefyVault} from '../../interfaces/IBeefyVault.sol';
import {IERC20Detailed} from '../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../interfaces/IPriceOracleGetter.sol';
import {IUniswapV2Router02} from '../../interfaces/IUniswapV2Router02.sol';
import {TransferHelper} from '../libraries/helpers/TransferHelper.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import 'hardhat/console.sol';

/**
 * @title BeefyETHVault
 * @notice mooScreamETH/WETH Vault by using Beefy on Fantom
 * @author Sturdy
 **/
contract BeefyETHVault is GeneralVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  function processYield() external override onlyAdmin {
    // Get yield from lendingPool
    address MOOWETH = _addressesProvider.getAddress('MOOWETH');
    address WETH = _addressesProvider.getAddress('WETH');
    uint256 yieldMOOWETH = _getYield(MOOWETH);

    // move yield to treasury
    if (_vaultFee > 0) {
      uint256 treasuryMOOWETH = _processTreasury(yieldMOOWETH);
      yieldMOOWETH = yieldMOOWETH.sub(treasuryMOOWETH);
    }

    // Withdraw from Beefy Vault and receive WETH
    uint256 before = IERC20(WETH).balanceOf(address(this));
    IBeefyVault(MOOWETH).withdraw(yieldMOOWETH);
    uint256 yieldWETH = IERC20(WETH).balanceOf(address(this)) - before;

    AssetYield[] memory assetYields = _getAssetYields(yieldWETH);
    for (uint256 i = 0; i < assetYields.length; i++) {
      // WETH -> Asset and Deposit to pool
      if (assetYields[i].amount > 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }

    emit ProcessYield(WETH, yieldWETH);
  }

  /**
   * @dev Swap 'WETH' using SpookySwap
   */
  function _convertAndDepositYield(address _tokenOut, uint256 _wethAmount) internal {
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');
    address WETH = _addressesProvider.getAddress('WETH');

    // Calculate minAmount from price with 1% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());

    uint256 minAmountFromPrice = _wethAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('MOOWETH')))
      .div(10**18)
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(_tokenOut))
      .percentMul(98_00);

    // Exchange WETH -> _tokenOut via UniswapV2
    address[] memory path = new address[](3);
    path[0] = address(WETH);
    path[1] = address(_addressesProvider.getAddress('WFTM'));
    path[2] = _tokenOut;

    IERC20(WETH).approve(uniswapRouter, _wethAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      _wethAmount,
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
    return _getYieldAmount(_addressesProvider.getAddress('MOOWETH'));
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    return IBeefyVault(_addressesProvider.getAddress('MOOWETH')).getPricePerFullShare();
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive MOOWETH
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    address MOOWETH = _addressesProvider.getAddress('MOOWETH');
    address WETH = _addressesProvider.getAddress('WETH');

    require(_asset == WETH, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    TransferHelper.safeTransferFrom(WETH, msg.sender, address(this), _amount);

    // Deposit WETH to Beefy Vault and receive mooScreamETH
    IERC20(WETH).approve(MOOWETH, _amount);

    uint256 before = IERC20(MOOWETH).balanceOf(address(this));
    IBeefyVault(MOOWETH).deposit(_amount);
    uint256 assetAmount = IERC20(MOOWETH).balanceOf(address(this)) - before;

    // Make lendingPool to transfer required amount
    IERC20(MOOWETH).approve(address(_addressesProvider.getLendingPool()), assetAmount);
    return (MOOWETH, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of mooScreamETH based on strategy
   */
  function _getWithdrawalAmount(address, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (_addressesProvider.getAddress('MOOWETH'), _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with mooScreamETH and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override {
    address MOOWETH = _addressesProvider.getAddress('MOOWETH');
    address WETH = _addressesProvider.getAddress('WETH');

    require(_asset == WETH, Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    // Withdraw from Beefy Vault and receive WETH
    uint256 before = IERC20(WETH).balanceOf(address(this));
    IBeefyVault(MOOWETH).withdraw(_amount);
    uint256 assetAmount = IERC20(WETH).balanceOf(address(this)) - before;

    // Deliver WETH to user
    TransferHelper.safeTransfer(WETH, _to, assetAmount);
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('MOOWETH')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
