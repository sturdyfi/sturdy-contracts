// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {GeneralVault} from '../GeneralVault.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IBeefyVault} from '../../../interfaces/IBeefyVault.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';
import {IUniswapV2Router02} from '../../../interfaces/IUniswapV2Router02.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {ILendingPool} from '../../../interfaces/ILendingPool.sol';
import {ILendingPoolAddressesProvider} from '../../../interfaces/ILendingPoolAddressesProvider.sol';

/**
 * @title BeefyETHVault
 * @notice mooScreamETH/WETH Vault by using Beefy on Fantom
 * @author Sturdy
 **/
contract BeefyETHVault is GeneralVault {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  /**
   * @dev Grab excess collateral internal asset which was from yield pool (Beefy)
   *  And convert to stable asset, transfer to lending pool
   * - Caller is only YieldProcessor which is multisig-wallet, but in the future anyone can call
   */
  function processYield() external override onlyYieldProcessor {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    // Get yield from lendingPool
    address MOOWETH = provider.getAddress('MOOWETH');
    address WETH = provider.getAddress('WETH');
    uint256 yieldMOOWETH = _getYield(MOOWETH);

    // move yield to treasury
    if (_vaultFee != 0) {
      uint256 treasuryMOOWETH = _processTreasury(yieldMOOWETH);
      yieldMOOWETH -= treasuryMOOWETH;
    }

    // Withdraw from Beefy Vault and receive WETH
    uint256 before = IERC20(WETH).balanceOf(address(this));
    IBeefyVault(MOOWETH).withdraw(yieldMOOWETH);
    uint256 yieldWETH = IERC20(WETH).balanceOf(address(this)) - before;

    AssetYield[] memory assetYields = _getAssetYields(yieldWETH);
    uint256 length = assetYields.length;
    for (uint256 i; i < length; ++i) {
      // WETH -> Asset and Deposit to pool
      if (assetYields[i].amount != 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }

    emit ProcessYield(WETH, yieldWETH);
  }

  /**
   * @dev  Convert from WETH to stable asset and deposit to lending pool
   * @param _tokenOut The address of stable asset
   * @param _wethAmount The amount of WETH
   */
  function _convertAndDepositYield(address _tokenOut, uint256 _wethAmount) internal {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address uniswapRouter = provider.getAddress('uniswapRouter');
    address WETH = provider.getAddress('WETH');
    address lendingPoolAddress = provider.getLendingPool();

    // Calculate minAmount from price with 1% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(provider.getPriceOracle());

    uint256 minAmountFromPrice = ((((_wethAmount *
      oracle.getAssetPrice(provider.getAddress('MOOWETH'))) / 10 ** 18) * 10 ** assetDecimal) /
      oracle.getAssetPrice(_tokenOut)).percentMul(98_00);

    // Exchange WETH -> _tokenOut via UniswapV2
    address[] memory path = new address[](3);
    path[0] = address(WETH);
    path[1] = address(provider.getAddress('WFTM'));
    path[2] = _tokenOut;

    IERC20(WETH).safeApprove(uniswapRouter, 0);
    IERC20(WETH).safeApprove(uniswapRouter, _wethAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      _wethAmount,
      minAmountFromPrice,
      path,
      address(this),
      block.timestamp
    );

    require(receivedAmounts[2] != 0, Errors.VT_PROCESS_YIELD_INVALID);
    require(
      IERC20(_tokenOut).balanceOf(address(this)) >= receivedAmounts[2],
      Errors.VT_PROCESS_YIELD_INVALID
    );

    // Make lendingPool to transfer required amount
    IERC20(_tokenOut).safeApprove(lendingPoolAddress, 0);
    IERC20(_tokenOut).safeApprove(lendingPoolAddress, receivedAmounts[2]);
    // Deposit yield to pool
    _depositYield(_tokenOut, receivedAmounts[2]);
  }

  /**
   * @dev Convert an `_amount` of collateral internal asset to collateral external asset and send to caller on liquidation.
   * - Caller is only LendingPool
   * @param _asset The address of collateral external asset
   * @param _amount The amount of collateral internal asset
   * @return The amount of collateral external asset
   */
  function withdrawOnLiquidation(
    address _asset,
    uint256 _amount
  ) external override returns (uint256) {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address WETH = provider.getAddress('WETH');

    require(_asset == WETH, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == provider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    // Withdraw from Beefy Vault and receive WETH
    uint256 before = IERC20(WETH).balanceOf(address(this));
    IBeefyVault(provider.getAddress('MOOWETH')).withdraw(_amount);
    uint256 assetAmount = IERC20(WETH).balanceOf(address(this)) - before;

    // Deliver WETH to user
    IERC20(WETH).safeTransfer(msg.sender, assetAmount);

    return assetAmount;
  }

  /**
   * @dev Get yield amount based on strategy
   * @return yield amount of collateral internal asset
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(_addressesProvider.getAddress('MOOWETH'));
  }

  /**
   * @dev Get price per share based on yield strategy
   * @return The value of price per share
   */
  function pricePerShare() external view override returns (uint256) {
    return IBeefyVault(_addressesProvider.getAddress('MOOWETH')).getPricePerFullShare();
  }

  /**
   * @dev Deposit collateral external asset to yield pool based on strategy and receive collateral internal asset
   * @param _asset The address of collateral external asset
   * @param _amount The amount of collateral external asset
   * @return The address of collateral internal asset
   * @return The amount of collateral internal asset
   */
  function _depositToYieldPool(
    address _asset,
    uint256 _amount
  ) internal override returns (address, uint256) {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address MOOWETH = provider.getAddress('MOOWETH');
    address WETH = provider.getAddress('WETH');
    address lendingPoolAddress = address(provider.getLendingPool());

    require(_asset == WETH, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    IERC20(WETH).safeTransferFrom(msg.sender, address(this), _amount);

    // Deposit WETH to Beefy Vault and receive mooScreamETH
    IERC20(WETH).safeApprove(MOOWETH, 0);
    IERC20(WETH).safeApprove(MOOWETH, _amount);

    uint256 before = IERC20(MOOWETH).balanceOf(address(this));
    IBeefyVault(MOOWETH).deposit(_amount);
    uint256 assetAmount = IERC20(MOOWETH).balanceOf(address(this)) - before;

    // Make lendingPool to transfer required amount
    IERC20(MOOWETH).safeApprove(lendingPoolAddress, 0);
    IERC20(MOOWETH).safeApprove(lendingPoolAddress, assetAmount);
    return (MOOWETH, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of collateral internal asset based on strategy
   * @param _asset The address of collateral external asset
   * @param _amount The withdrawal amount of collateral external asset
   * @return The address of collateral internal asset
   * @return The withdrawal amount of collateral internal asset
   */
  function _getWithdrawalAmount(
    address _asset,
    uint256 _amount
  ) internal view override returns (address, uint256) {
    ILendingPoolAddressesProvider provider = _addressesProvider;

    require(_asset == provider.getAddress('WETH'), Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    // In this vault, return same amount of asset.
    return (provider.getAddress('MOOWETH'), _amount);
  }

  /**
   * @dev Withdraw collateral internal asset from yield pool based on strategy and deliver collateral external asset
   * @param - The address of collateral external asset
   * @param _amount The withdrawal amount of collateral internal asset
   * @param _to The address of receiving collateral external asset
   * @return The amount of collateral external asset
   */
  function _withdrawFromYieldPool(
    address,
    uint256 _amount,
    address _to
  ) internal override returns (uint256) {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address WETH = provider.getAddress('WETH');

    // Withdraw from Beefy Vault and receive WETH
    uint256 before = IERC20(WETH).balanceOf(address(this));
    IBeefyVault(provider.getAddress('MOOWETH')).withdraw(_amount);
    uint256 assetAmount = IERC20(WETH).balanceOf(address(this)) - before;

    // Deliver WETH to user
    IERC20(WETH).safeTransfer(_to, assetAmount);
    return assetAmount;
  }

  /**
   * @dev Get the list of assets and distributed yield amount per asset based on asset's TVL
   * @param _amount The amount of yield which is going to distribute per asset
   * @return The list of assets and distributed yield amount per asset
   **/
  function _getAssetYields(uint256 _amount) internal view returns (AssetYield[] memory) {
    // Get total borrowing asset volume and volumes and assets
    (
      uint256 totalVolume,
      uint256[] memory volumes,
      address[] memory assets,
      uint256 length
    ) = ILendingPool(_addressesProvider.getLendingPool()).getBorrowingAssetAndVolumes();

    if (totalVolume == 0) return new AssetYield[](0);

    AssetYield[] memory assetYields = new AssetYield[](length);
    uint256 extraWETHAmount = _amount;

    for (uint256 i; i < length; ++i) {
      assetYields[i].asset = assets[i];
      if (i == length - 1) {
        // without calculation, set remained extra amount
        assetYields[i].amount = extraWETHAmount;
      } else {
        // Distribute wethAmount based on percent of asset volume
        assetYields[i].amount = _amount.percentMul(
          (volumes[i] * PercentageMath.PERCENTAGE_FACTOR) / totalVolume
        );
        extraWETHAmount -= assetYields[i].amount;
      }
    }

    return assetYields;
  }

  /**
   * @dev Deposit yield amount to lending pool
   * @param _asset The address of stable asset
   * @param _amount The amount of stable asset
   **/
  function _depositYield(address _asset, uint256 _amount) internal {
    ILendingPool(_addressesProvider.getLendingPool()).depositYield(_asset, _amount);
  }

  /**
   * @dev Move some yield to treasury
   * @param _yieldAmount The yield amount of collateral internal asset
   * @return The yield amount for treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('MOOWETH')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
