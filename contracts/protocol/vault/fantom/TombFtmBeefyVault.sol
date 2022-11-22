// SPDX-License-Identifier: agpl-3.0
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
 * @title TombFtmBeefyVault
 * @notice mooTombTOMB-FTM/TOMB_FTM_LP Vault by using Beefy on Fantom
 * @author Sturdy
 **/
contract TombFtmBeefyVault is GeneralVault {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  /**
   * @dev Receive FTM
   */
  receive() external payable {}

  /**
   * @dev Grab excess collateral internal asset which was from yield pool (Beefy)
   *  And convert to stable asset, transfer to lending pool
   * - Caller is only YieldProcessor which is multisig-wallet, but in the future anyone can call
   */
  function processYield() external override onlyYieldProcessor {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    // Get yield from lendingPool
    address MOO_TOMB_FTM = provider.getAddress('mooTombTOMB-FTM');
    address TOMB_FTM_LP = provider.getAddress('TOMB_FTM_LP');
    uint256 yieldMOO_TOMB_FTM = _getYield(MOO_TOMB_FTM);

    // move yield to treasury
    if (_vaultFee != 0) {
      uint256 treasuryMOO_TOMB_FTM = _processTreasury(yieldMOO_TOMB_FTM);
      yieldMOO_TOMB_FTM -= treasuryMOO_TOMB_FTM;
    }

    // Withdraw from Beefy Vault and receive TOMB_FTM_LP
    uint256 before = IERC20(TOMB_FTM_LP).balanceOf(address(this));
    IBeefyVault(MOO_TOMB_FTM).withdraw(yieldMOO_TOMB_FTM);
    uint256 yieldTOMB_FTM_LP = IERC20(TOMB_FTM_LP).balanceOf(address(this)) - before;

    // Withdraw TOMB_FTM_LP from spookyswap pool and receive FTM and TOMB
    (uint256 yieldTOMB, uint256 yieldFTM) = _withdrawLiquidityPool(TOMB_FTM_LP, yieldTOMB_FTM_LP);

    // Deposit TOMB Yield
    AssetYield[] memory assetYields = _getAssetYields(yieldTOMB);
    uint256 length = assetYields.length;
    for (uint256 i; i < length; ++i) {
      // TOMB -> Asset and Deposit to pool
      if (assetYields[i].amount != 0) {
        _convertAndDepositTokenYield(assetYields[i].asset, assetYields[i].amount);
      }
    }

    // Deposit FTM Yield
    assetYields = _getAssetYields(yieldFTM);
    length = assetYields.length;
    for (uint256 i; i < length; ++i) {
      // FTM -> Asset and Deposit to pool
      if (assetYields[i].amount != 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }

    emit ProcessYield(TOMB_FTM_LP, yieldTOMB_FTM_LP);
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
    address TOMB_FTM_LP = provider.getAddress('TOMB_FTM_LP');
    address MOO_TOMB_FTM = provider.getAddress('mooTombTOMB-FTM');

    require(_asset == TOMB_FTM_LP, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == provider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    // Withdraw from Beefy Vault and receive TOMB_FTM_LP
    uint256 before = IERC20(TOMB_FTM_LP).balanceOf(address(this));
    IBeefyVault(MOO_TOMB_FTM).withdraw(_amount);
    uint256 assetAmount = IERC20(TOMB_FTM_LP).balanceOf(address(this)) - before;

    // Deliver TOMB_FTM_LP to user
    IERC20(TOMB_FTM_LP).safeTransfer(msg.sender, assetAmount);

    return assetAmount;
  }

  /**
   * @dev  Withdraw collateral external asset from Spookyswap pool and receive FTM and TOMB
   * @param _poolAddress The address of Spookyswap pool
   * @param _amount The amount of collateral external asset
   * @return amountToken - The amount of TOMB
   * @return amountFTM - The amount of FTM
   */
  function _withdrawLiquidityPool(address _poolAddress, uint256 _amount)
    internal
    returns (uint256 amountToken, uint256 amountFTM)
  {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address uniswapRouter = provider.getAddress('uniswapRouter');

    // Calculate minAmount from price with 1% slippage
    IPriceOracleGetter oracle = IPriceOracleGetter(provider.getPriceOracle());
    uint256 minTotalPrice = ((_amount *
      oracle.getAssetPrice(provider.getAddress('mooTombTOMB-FTM'))) / 2).percentMul(99_00);

    uint256 minFTMAmountFromPrice = minTotalPrice /
      oracle.getAssetPrice(provider.getAddress('YVWFTM'));

    uint256 minTokenAmountFromPrice = minTotalPrice /
      oracle.getAssetPrice(provider.getAddress('TOMB'));

    IERC20(_poolAddress).safeApprove(uniswapRouter, 0);
    IERC20(_poolAddress).safeApprove(uniswapRouter, _amount);
    (amountToken, amountFTM) = IUniswapV2Router02(uniswapRouter).removeLiquidityETH(
      provider.getAddress('TOMB'),
      _amount,
      minTokenAmountFromPrice,
      minFTMAmountFromPrice,
      address(this),
      block.timestamp
    );
  }

  /**
   * @dev  Convert from TOMB to stable asset and deposit to lending pool
   * @param _tokenOut The address of stable asset
   * @param _tombAmount The amount of TOMB
   */
  function _convertAndDepositTokenYield(address _tokenOut, uint256 _tombAmount) internal {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address uniswapRouter = provider.getAddress('uniswapRouter');
    address TOMB = provider.getAddress('TOMB');
    address lendingPoolAddress = provider.getLendingPool();

    // Calculate minAmount from price with 2% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(provider.getPriceOracle());
    uint256 minAmountFromPrice = ((((_tombAmount * oracle.getAssetPrice(TOMB)) / 10**18) *
      10**assetDecimal) / oracle.getAssetPrice(_tokenOut)).percentMul(98_00);

    // Exchange TOMB -> _tokenOut via UniswapV2
    address[] memory path = new address[](3);
    path[0] = TOMB;
    path[1] = provider.getAddress('WFTM');
    path[2] = _tokenOut;

    IERC20(TOMB).safeApprove(uniswapRouter, 0);
    IERC20(TOMB).safeApprove(uniswapRouter, _tombAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      _tombAmount,
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
    return _getYieldAmount(_addressesProvider.getAddress('mooTombTOMB-FTM'));
  }

  /**
   * @dev Get price per share based on yield strategy
   * @return The value of price per share
   */
  function pricePerShare() external view override returns (uint256) {
    return IBeefyVault(_addressesProvider.getAddress('mooTombTOMB-FTM')).getPricePerFullShare();
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
    address MOO_TOMB_FTM = provider.getAddress('mooTombTOMB-FTM');
    address TOMB_FTM_LP = provider.getAddress('TOMB_FTM_LP');
    address lendingPoolAddress = provider.getLendingPool();

    require(_asset == TOMB_FTM_LP, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    IERC20(TOMB_FTM_LP).safeTransferFrom(msg.sender, address(this), _amount);

    // Deposit TOMB_FTM_LP to Beefy Vault and receive mooTombTOMB-FTM
    IERC20(TOMB_FTM_LP).safeApprove(MOO_TOMB_FTM, 0);
    IERC20(TOMB_FTM_LP).safeApprove(MOO_TOMB_FTM, _amount);

    uint256 before = IERC20(MOO_TOMB_FTM).balanceOf(address(this));
    IBeefyVault(MOO_TOMB_FTM).deposit(_amount);
    uint256 assetAmount = IERC20(MOO_TOMB_FTM).balanceOf(address(this)) - before;

    // Make lendingPool to transfer required amount
    IERC20(MOO_TOMB_FTM).safeApprove(lendingPoolAddress, 0);
    IERC20(MOO_TOMB_FTM).safeApprove(lendingPoolAddress, assetAmount);
    return (MOO_TOMB_FTM, assetAmount);
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

    require(_asset == provider.getAddress('TOMB_FTM_LP'), Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    // In this vault, return same amount of asset.
    return (provider.getAddress('mooTombTOMB-FTM'), _amount);
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
    address TOMB_FTM_LP = provider.getAddress('TOMB_FTM_LP');

    // Withdraw from Beefy Vault and receive TOMB_FTM_LP
    uint256 before = IERC20(TOMB_FTM_LP).balanceOf(address(this));
    IBeefyVault(provider.getAddress('mooTombTOMB-FTM')).withdraw(_amount);
    uint256 assetAmount = IERC20(TOMB_FTM_LP).balanceOf(address(this)) - before;

    // Deliver TOMB_FTM_LP to user
    IERC20(TOMB_FTM_LP).safeTransfer(_to, assetAmount);
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
    IERC20(_addressesProvider.getAddress('mooTombTOMB-FTM')).safeTransfer(
      _treasuryAddress,
      treasuryAmount
    );
    return treasuryAmount;
  }
}
