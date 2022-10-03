// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {GeneralVault} from '../GeneralVault.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IYearnFinanceVault} from '../../../interfaces/IYearnFinanceVault.sol';
import {IUniswapV2Router02} from '../../../interfaces/IUniswapV2Router02.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';
import {ILendingPool} from '../../../interfaces/ILendingPool.sol';
import {ILendingPoolAddressesProvider} from '../../../interfaces/ILendingPoolAddressesProvider.sol';

/**
 * @title YearnWBTCVault
 * @notice yvWBTC/WBTC Vault by using Yearn on Fantom
 * @author Sturdy
 **/
contract YearnWBTCVault is GeneralVault {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  /**
   * @dev Grab excess collateral internal asset which was from yield pool (Yearn)
   *  And convert to stable asset, transfer to lending pool
   * - Caller is only YieldProcessor which is multisig-wallet, but in the future anyone can call
   */
  function processYield() external override onlyYieldProcessor {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    // Get yield from lendingPool
    address YVWBTC = provider.getAddress('YVWBTC');
    uint256 yieldYVWBTC = _getYield(YVWBTC);

    // move yield to treasury
    if (_vaultFee != 0) {
      uint256 treasuryYVWBTC = _processTreasury(yieldYVWBTC);
      yieldYVWBTC -= treasuryYVWBTC;
    }

    // Withdraw from Yearn Vault and receive WBTC
    uint256 yieldWBTC = IYearnFinanceVault(YVWBTC).withdraw(yieldYVWBTC, address(this), 1);

    AssetYield[] memory assetYields = _getAssetYields(yieldWBTC);
    uint256 length = assetYields.length;
    for (uint256 i; i < length; ++i) {
      // WBTC -> Asset and Deposit to pool
      if (assetYields[i].amount != 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }

    emit ProcessYield(provider.getAddress('WBTC'), yieldWBTC);
  }

  /**
   * @dev Convert an `_amount` of collateral internal asset to collateral external asset and send to caller on liquidation.
   * - Caller is only LendingPool
   * @param _asset The address of collateral external asset
   * @param _amount The amount of collateral internal asset
   * @return The amount of collateral external asset
   */
  function withdrawOnLiquidation(address _asset, uint256 _amount)
    external
    override
    returns (uint256)
  {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address WBTC = provider.getAddress('WBTC');

    require(_asset == WBTC, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == provider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    // Withdraw from Yearn Vault and receive WBTC
    uint256 assetAmount = IYearnFinanceVault(provider.getAddress('YVWBTC')).withdraw(
      _amount,
      address(this),
      1
    );

    // Deliver WBTC to user
    IERC20(WBTC).safeTransfer(msg.sender, assetAmount);

    return assetAmount;
  }

  /**
   * @dev  Convert from WBTC to stable asset and deposit to lending pool
   * @param _tokenOut The address of stable asset
   * @param _wbtcAmount The amount of WBTC
   */
  function _convertAndDepositYield(address _tokenOut, uint256 _wbtcAmount) internal {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address uniswapRouter = provider.getAddress('uniswapRouter');
    address WBTC = provider.getAddress('WBTC');
    address lendingPoolAddress = provider.getLendingPool();

    // Calculate minAmount from price with 2% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(provider.getPriceOracle());
    uint256 minAmountFromPrice = ((((_wbtcAmount *
      oracle.getAssetPrice(provider.getAddress('YVWBTC'))) / 10**8) * 10**assetDecimal) /
      oracle.getAssetPrice(_tokenOut)).percentMul(98_00);

    // Exchange WBTC -> _tokenOut via UniswapV2
    address[] memory path = new address[](3);
    path[0] = WBTC;
    path[1] = provider.getAddress('WFTM');
    path[2] = _tokenOut;

    IERC20(WBTC).safeApprove(uniswapRouter, 0);
    IERC20(WBTC).safeApprove(uniswapRouter, _wbtcAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      _wbtcAmount,
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
   * @dev Get yield amount based on strategy
   * @return yield amount of collateral internal asset
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(_addressesProvider.getAddress('YVWBTC'));
  }

  /**
   * @dev Get price per share based on yield strategy
   * @return The value of price per share
   */
  function pricePerShare() external view override returns (uint256) {
    return IYearnFinanceVault(_addressesProvider.getAddress('YVWBTC')).pricePerShare();
  }

  /**
   * @dev Deposit collateral external asset to yield pool based on strategy and receive collateral internal asset
   * @param _asset The address of collateral external asset
   * @param _amount The amount of collateral external asset
   * @return The address of collateral internal asset
   * @return The amount of collateral internal asset
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address YVWBTC = provider.getAddress('YVWBTC');
    address WBTC = provider.getAddress('WBTC');
    address lendingPoolAddress = provider.getLendingPool();

    // Case of WBTC deposit from user, receive WBTC from user
    require(_asset == WBTC, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    IERC20(WBTC).safeTransferFrom(msg.sender, address(this), _amount);

    // Deposit WBTC to Yearn Vault and receive yvWBTC
    IERC20(WBTC).safeApprove(YVWBTC, 0);
    IERC20(WBTC).safeApprove(YVWBTC, _amount);
    uint256 assetAmount = IYearnFinanceVault(YVWBTC).deposit(_amount, address(this));

    // Make lendingPool to transfer required amount
    IERC20(YVWBTC).safeApprove(lendingPoolAddress, 0);
    IERC20(YVWBTC).safeApprove(lendingPoolAddress, assetAmount);
    return (YVWBTC, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of collateral internal asset based on strategy
   * @param _asset The address of collateral external asset
   * @param _amount The withdrawal amount of collateral external asset
   * @return The address of collateral internal asset
   * @return The withdrawal amount of collateral internal asset
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    ILendingPoolAddressesProvider provider = _addressesProvider;

    require(_asset == provider.getAddress('WBTC'), Errors.VT_COLLATERAL_WITHDRAW_INVALID);
    // In this vault, return same amount of asset.
    return (provider.getAddress('YVWBTC'), _amount);
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

    // Withdraw from Yearn Vault and receive WBTC
    uint256 assetAmount = IYearnFinanceVault(provider.getAddress('YVWBTC')).withdraw(
      _amount,
      address(this),
      1
    );

    // Deliver WBTC to user
    address WBTC = provider.getAddress('WBTC');
    IERC20(WBTC).safeTransfer(_to, assetAmount);
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
    IERC20(_addressesProvider.getAddress('YVWBTC')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
