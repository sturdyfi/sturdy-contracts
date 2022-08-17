// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {GeneralVault} from '../GeneralVault.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IWETH} from '../../../misc/interfaces/IWETH.sol';
import {IYearnVault} from '../../../interfaces/IYearnVault.sol';
import {IUniswapV2Router02} from '../../../interfaces/IUniswapV2Router02.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';
import {ILendingPool} from '../../../interfaces/ILendingPool.sol';
import {ILendingPoolAddressesProvider} from '../../../interfaces/ILendingPoolAddressesProvider.sol';

/**
 * @title YearnVault
 * @notice yvWFTM/WFTM Vault by using Yearn on Fantom
 * @author Sturdy
 **/
contract YearnVault is GeneralVault {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  /**
   * @dev Receive FTM
   */
  receive() external payable {}

  /**
   * @dev Grab excess collateral internal asset which was from yield pool (Yearn)
   *  And convert to stable asset, transfer to lending pool
   * - Caller is only YieldProcessor which is multisig-wallet, but in the future anyone can call
   */
  function processYield() external override onlyYieldProcessor {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    // Get yield from lendingPool
    address YVWFTM = provider.getAddress('YVWFTM');
    uint256 yieldYVWFTM = _getYield(YVWFTM);

    // move yield to treasury
    if (_vaultFee != 0) {
      uint256 treasuryYVWFTM = _processTreasury(yieldYVWFTM);
      yieldYVWFTM -= treasuryYVWFTM;
    }

    // Withdraw from Yearn Vault and receive WFTM
    uint256 yieldWFTM = IYearnVault(YVWFTM).withdraw(yieldYVWFTM, address(this), 1);

    // WFTM -> FTM
    IWETH(provider.getAddress('WFTM')).withdraw(yieldWFTM);

    AssetYield[] memory assetYields = _getAssetYields(yieldWFTM);
    uint256 length = assetYields.length;
    for (uint256 i; i < length; ++i) {
      // FTM -> Asset and Deposit to pool
      if (assetYields[i].amount != 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }

    emit ProcessYield(provider.getAddress('WFTM'), yieldWFTM);
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
    address WFTM = provider.getAddress('WFTM');

    require(_asset == WFTM, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == provider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    // Withdraw from Yearn Vault and receive WFTM
    uint256 assetAmount = IYearnVault(provider.getAddress('YVWFTM')).withdraw(
      _amount,
      address(this),
      1
    );

    // Deliver WFTM to user
    IERC20(WFTM).safeTransfer(msg.sender, assetAmount);

    return assetAmount;
  }

  /**
   * @dev  Convert from FTM to stable asset and deposit to lending pool
   * @param _tokenOut The address of stable asset
   * @param _ftmAmount The amount of FTM
   */
  function _convertAndDepositYield(address _tokenOut, uint256 _ftmAmount) internal {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    // Approve the uniswapRouter to spend WFTM.
    address uniswapRouter = provider.getAddress('uniswapRouter');
    address WFTM = provider.getAddress('WFTM');
    address lendingPoolAddress = provider.getLendingPool();

    // Calculate minAmount from price with 1% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(provider.getPriceOracle());
    uint256 minAmountFromPrice = ((((_ftmAmount *
      oracle.getAssetPrice(provider.getAddress('YVWFTM'))) / 10**18) * 10**assetDecimal) /
      oracle.getAssetPrice(_tokenOut)).percentMul(99_00);

    // Exchange FTM -> _tokenOut via UniswapV2
    address[] memory path = new address[](2);
    path[0] = address(WFTM);
    path[1] = _tokenOut;

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactETHForTokens{
      value: _ftmAmount
    }(minAmountFromPrice, path, address(this), block.timestamp);
    require(receivedAmounts[1] != 0, Errors.VT_PROCESS_YIELD_INVALID);
    require(
      IERC20(_tokenOut).balanceOf(address(this)) >= receivedAmounts[1],
      Errors.VT_PROCESS_YIELD_INVALID
    );

    // Make lendingPool to transfer required amount
    IERC20(_tokenOut).safeApprove(lendingPoolAddress, 0);
    IERC20(_tokenOut).safeApprove(lendingPoolAddress, receivedAmounts[1]);
    // Deposit yield to pool
    _depositYield(_tokenOut, receivedAmounts[1]);
  }

  /**
   * @dev Get yield amount based on strategy
   * @return yield amount of collateral internal asset
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(_addressesProvider.getAddress('YVWFTM'));
  }

  /**
   * @dev Get price per share based on yield strategy
   * @return The value of price per share
   */
  function pricePerShare() external view override returns (uint256) {
    return IYearnVault(_addressesProvider.getAddress('YVWFTM')).pricePerShare();
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
    address YVWFTM = provider.getAddress('YVWFTM');
    address WFTM = provider.getAddress('WFTM');
    address lendingPoolAddress = provider.getLendingPool();
    uint256 assetAmount = _amount;
    if (_asset == address(0)) {
      // Case of FTM deposit from user, user has to send FTM
      require(msg.value != 0, Errors.VT_COLLATERAL_DEPOSIT_REQUIRE_ETH);

      // FTM -> WFTM
      IWETH(WFTM).deposit{value: msg.value}();

      assetAmount = msg.value;
    } else {
      // Case of WFTM deposit from user, receive WFTM from user
      require(_asset == WFTM, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
      IERC20(WFTM).safeTransferFrom(msg.sender, address(this), _amount);
    }

    // Deposit WFTM to Yearn Vault and receive yvWFTM
    IERC20(WFTM).safeApprove(YVWFTM, 0);
    IERC20(WFTM).safeApprove(YVWFTM, assetAmount);
    assetAmount = IYearnVault(YVWFTM).deposit(assetAmount, address(this));

    // Make lendingPool to transfer required amount
    IERC20(YVWFTM).safeApprove(lendingPoolAddress, 0);
    IERC20(YVWFTM).safeApprove(lendingPoolAddress, assetAmount);
    return (YVWFTM, assetAmount);
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

    require(
      _asset == provider.getAddress('WFTM') || _asset == address(0),
      Errors.VT_COLLATERAL_WITHDRAW_INVALID
    );

    // In this vault, return same amount of asset.
    return (provider.getAddress('YVWFTM'), _amount);
  }

  /**
   * @dev Withdraw collateral internal asset from yield pool based on strategy and deliver collateral external asset
   * @param _asset The address of collateral external asset
   * @param _amount The withdrawal amount of collateral internal asset
   * @param _to The address of receiving collateral external asset
   * @return The amount of collateral external asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override returns (uint256) {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address WFTM = provider.getAddress('WFTM');

    // Withdraw from Yearn Vault and receive WFTM
    uint256 assetAmount = IYearnVault(provider.getAddress('YVWFTM')).withdraw(
      _amount,
      address(this),
      1
    );
    if (_asset == address(0)) {
      // WFTM -> FTM
      IWETH(WFTM).withdraw(assetAmount);

      // send FTM to user
      (bool sent, ) = address(_to).call{value: assetAmount}('');
      require(sent, Errors.VT_COLLATERAL_WITHDRAW_INVALID);
    } else {
      // Deliver WFTM to user
      IERC20(WFTM).safeTransfer(_to, assetAmount);
    }
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
    IERC20(_addressesProvider.getAddress('YVWFTM')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
