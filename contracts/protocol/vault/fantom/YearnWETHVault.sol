// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {GeneralVault} from '../GeneralVault.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IYearnVault} from '../../../interfaces/IYearnVault.sol';
import {IUniswapV2Router02} from '../../../interfaces/IUniswapV2Router02.sol';
import {TransferHelper} from '../../libraries/helpers/TransferHelper.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';
import {ILendingPool} from '../../../interfaces/ILendingPool.sol';

/**
 * @title YearnWETHVault
 * @notice yvWETH/WETH Vault by using Yearn on Fantom
 * @author Sturdy
 **/
contract YearnWETHVault is GeneralVault {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  function processYield() external override onlyYieldProcessor {
    // Get yield from lendingPool
    address YVWETH = _addressesProvider.getAddress('YVWETH');
    uint256 yieldYVWETH = _getYield(YVWETH);

    // move yield to treasury
    if (_vaultFee > 0) {
      uint256 treasuryYVWETH = _processTreasury(yieldYVWETH);
      yieldYVWETH -= treasuryYVWETH;
    }

    // Withdraw from Yearn Vault and receive WETH
    uint256 yieldWETH = IYearnVault(YVWETH).withdraw(yieldYVWETH, address(this), 1);

    AssetYield[] memory assetYields = _getAssetYields(yieldWETH);
    for (uint256 i = 0; i < assetYields.length; i++) {
      // WETH -> Asset and Deposit to pool
      if (assetYields[i].amount > 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }

    emit ProcessYield(_addressesProvider.getAddress('WETH'), yieldWETH);
  }

  function withdrawOnLiquidation(address _asset, uint256 _amount)
    external
    override
    returns (uint256)
  {
    address WETH = _addressesProvider.getAddress('WETH');

    require(_asset == WETH, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == _addressesProvider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    // Withdraw from Yearn Vault and receive WETH
    uint256 assetAmount = IYearnVault(_addressesProvider.getAddress('YVWETH')).withdraw(
      _amount,
      address(this),
      1
    );

    // Deliver WETH to user
    TransferHelper.safeTransfer(WETH, msg.sender, assetAmount);

    return assetAmount;
  }

  function _convertAndDepositYield(address _tokenOut, uint256 _wethAmount) internal {
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');
    address WETH = _addressesProvider.getAddress('WETH');
    address WFTM = _addressesProvider.getAddress('WFTM');

    // Calculate minAmount from price with 1% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 _minFTMAmount = ((_wethAmount *
      oracle.getAssetPrice(_addressesProvider.getAddress('YVWETH'))) /
      oracle.getAssetPrice(_addressesProvider.getAddress('YVWFTM'))).percentMul(99_00);

    uint256 minAmountFromPrice = ((_minFTMAmount *
      oracle.getAssetPrice(_addressesProvider.getAddress('YVWFTM')) *
      10**assetDecimal) /
      10**18 /
      oracle.getAssetPrice(_tokenOut)).percentMul(99_00);

    // Exchange WETH -> _tokenOut via UniswapV2
    address[] memory path = new address[](3);
    path[0] = address(WETH);
    path[1] = address(WFTM);
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
    return _getYieldAmount(_addressesProvider.getAddress('YVWETH'));
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    return IYearnVault(_addressesProvider.getAddress('YVWETH')).pricePerShare();
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive yvWETH
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    address YVWETH = _addressesProvider.getAddress('YVWETH');
    address WETH = _addressesProvider.getAddress('WETH');

    // Case of WETH deposit from user, receive WETH from user
    require(_asset == WETH, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    TransferHelper.safeTransferFrom(WETH, msg.sender, address(this), _amount);

    // Deposit WETH to Yearn Vault and receive yvWETH
    IERC20(WETH).approve(YVWETH, _amount);
    uint256 assetAmount = IYearnVault(YVWETH).deposit(_amount, address(this));

    // Make lendingPool to transfer required amount
    IERC20(YVWETH).approve(address(_addressesProvider.getLendingPool()), assetAmount);
    return (YVWETH, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of yvWETH based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (_addressesProvider.getAddress('YVWETH'), _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with yvWETH and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override returns (uint256) {
    address YVWETH = _addressesProvider.getAddress('YVWETH');
    address WETH = _addressesProvider.getAddress('WETH');

    // Withdraw from Yearn Vault and receive WETH
    uint256 assetAmount = IYearnVault(YVWETH).withdraw(_amount, address(this), 1);

    require(_asset == WETH, Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    // Deliver WETH to user
    TransferHelper.safeTransfer(WETH, _to, assetAmount);
    return assetAmount;
  }

  /**
   * @dev Get the list of asset and asset's yield amount
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

    for (uint256 i; i < length; i++) {
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

  function _depositYield(address _asset, uint256 _amount) internal {
    ILendingPool(_addressesProvider.getLendingPool()).depositYield(_asset, _amount);
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('YVWETH')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
