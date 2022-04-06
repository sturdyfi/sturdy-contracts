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
 * @title YearnSPELLVault
 * @notice yvSPELL/SPELL Vault by using Yearn on Fantom
 * @author Sturdy
 **/
contract YearnSPELLVault is GeneralVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  function processYield() external override onlyAdmin {
    // Get yield from lendingPool
    address YVSPELL = _addressesProvider.getAddress('YVSPELL');
    uint256 yieldYVSPELL = _getYield(YVSPELL);

    // move yield to treasury
    if (_vaultFee > 0) {
      uint256 treasuryYVSPELL = _processTreasury(yieldYVSPELL);
      yieldYVSPELL = yieldYVSPELL.sub(treasuryYVSPELL);
    }

    // Withdraw from Yearn Vault and receive SPELL
    uint256 yieldSPELL = IYearnVault(YVSPELL).withdraw(yieldYVSPELL, address(this), 1);

    AssetYield[] memory assetYields = _getAssetYields(yieldSPELL);
    for (uint256 i = 0; i < assetYields.length; i++) {
      // SPELL -> Asset and Deposit to pool
      if (assetYields[i].amount > 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }

    emit ProcessYield(_addressesProvider.getAddress('SPELL'), yieldSPELL);
  }

  function withdrawOnLiquidation(address _asset, uint256 _amount)
    external
    override
    returns (uint256)
  {
    address SPELL = _addressesProvider.getAddress('SPELL');

    require(_asset == SPELL, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == _addressesProvider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    // Withdraw from Yearn Vault and receive SPELL
    uint256 assetAmount = IYearnVault(_addressesProvider.getAddress('YVSPELL')).withdraw(
      _amount,
      address(this),
      1
    );

    // Deliver SPELL to user
    TransferHelper.safeTransfer(SPELL, msg.sender, assetAmount);

    return assetAmount;
  }

  function _convertAndDepositYield(address _tokenOut, uint256 _spellAmount) internal {
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');
    address SPELL = _addressesProvider.getAddress('SPELL');

    // Calculate minAmount from price with 2% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 minAmountFromPrice = _spellAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('YVSPELL')))
      .div(10**18)
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(_tokenOut))
      .percentMul(98_00);

    // Exchange SPELL -> _tokenOut via UniswapV2
    address[] memory path = new address[](3);
    path[0] = SPELL;
    path[1] = _addressesProvider.getAddress('WFTM');
    path[2] = _tokenOut;

    IERC20(SPELL).approve(uniswapRouter, _spellAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      _spellAmount,
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
    return _getYieldAmount(_addressesProvider.getAddress('YVSPELL'));
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    return IYearnVault(_addressesProvider.getAddress('YVSPELL')).pricePerShare();
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive yvSPELL
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    address YVSPELL = _addressesProvider.getAddress('YVSPELL');
    address SPELL = _addressesProvider.getAddress('SPELL');

    // receive SPELL from user
    require(_asset == SPELL, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    TransferHelper.safeTransferFrom(SPELL, msg.sender, address(this), _amount);

    // Deposit SPELL to Yearn Vault and receive yvSPELL
    IERC20(SPELL).approve(YVSPELL, _amount);
    uint256 assetAmount = IYearnVault(YVSPELL).deposit(_amount, address(this));

    // Make lendingPool to transfer required amount
    IERC20(YVSPELL).approve(address(_addressesProvider.getLendingPool()), assetAmount);
    return (YVSPELL, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of yvSPELL based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (_addressesProvider.getAddress('YVSPELL'), _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with yvSPELL and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override {
    address YVSPELL = _addressesProvider.getAddress('YVSPELL');
    address SPELL = _addressesProvider.getAddress('SPELL');

    require(_asset == SPELL, Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    // Withdraw from Yearn Vault and receive SPELL
    uint256 assetAmount = IYearnVault(YVSPELL).withdraw(_amount, address(this), 1);

    // Deliver SPELL to user
    TransferHelper.safeTransfer(SPELL, _to, assetAmount);
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('YVSPELL')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
