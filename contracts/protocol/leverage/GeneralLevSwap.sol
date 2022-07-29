// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IERC20Detailed} from '../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {IPriceOracleGetter} from '../../interfaces/IPriceOracleGetter.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import {IGeneralVault} from '../../interfaces/IGeneralVault.sol';
import {IAToken} from '../../interfaces/IAToken.sol';
import {DataTypes} from '../libraries/types/DataTypes.sol';
import {ReserveConfiguration} from '../libraries/configuration/ReserveConfiguration.sol';
import {Math} from '../../dependencies/openzeppelin/contracts/Math.sol';
import {Errors} from '../libraries/helpers/Errors.sol';

abstract contract GeneralLevSwap {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;
  using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

  uint256 public constant USE_VARIABLE_DEBT = 2;

  address public immutable COLLATERAL; // The addrss of external asset

  uint256 public immutable DECIMALS; // The collateral decimals

  address public immutable VAULT; // The address of vault

  uint256 public constant SAFE_BUFFER = 5000;

  mapping(address => bool) ENABLED_STABLE_COINS;

  ILendingPoolAddressesProvider internal immutable PROVIDER;

  IPriceOracleGetter internal immutable ORACLE;

  ILendingPool internal immutable LENDING_POOL;

  event EnterPosition(
    uint256 amount,
    uint256 iterations,
    uint256 ltv,
    address indexed borrowedCoin
  );

  event LeavePosition(uint256 amount, address indexed borrowedCoin);

  /**
   * @param _asset The external asset ex. wFTM
   * @param _vault The deployed vault address
   * @param _provider The deployed AddressProvider
   */
  constructor(
    address _asset,
    address _vault,
    address _provider
  ) {
    require(
      _asset != address(0) && _provider != address(0) && _vault != address(0),
      Errors.LS_INVALID_CONFIGURATION
    );

    COLLATERAL = _asset;
    DECIMALS = IERC20Detailed(_asset).decimals();
    VAULT = _vault;
    PROVIDER = ILendingPoolAddressesProvider(_provider);
    ORACLE = IPriceOracleGetter(PROVIDER.getPriceOracle());
    LENDING_POOL = ILendingPool(PROVIDER.getLendingPool());
    IERC20(COLLATERAL).approve(_vault, type(uint256).max);
  }

  /**
   * Get stable coins available to borrow
   */
  function getAvailableStableCoins() external pure virtual returns (address[] memory) {
    return new address[](0);
  }

  /**
   * @return The asset price in ETH according to Sturdy PriceOracle
   */
  function getAssetPrice(address _asset) public view returns (uint256) {
    return ORACLE.getAssetPrice(_asset);
  }

  /**
   * @param _principal - The amount of collateral
   * @param _iterations - Loop count
   * @param _ltv - The loan to value of the asset in 4 decimals ex. 82.5% == 8250
   * @param _stableAsset - The borrowing stable coin address when leverage works
   */
  function enterPosition(
    uint256 _principal,
    uint256 _iterations,
    uint256 _ltv,
    address _stableAsset
  ) public {
    require(_principal > 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(ENABLED_STABLE_COINS[_stableAsset], Errors.LS_STABLE_COIN_NOT_SUPPORTED);
    require(IERC20(COLLATERAL).balanceOf(msg.sender) >= _principal, Errors.LS_SUPPLY_NOT_ALLOWED);

    IERC20(COLLATERAL).safeTransferFrom(msg.sender, address(this), _principal);

    _supply(_principal);

    uint256 suppliedAmount = _principal;
    uint256 borrowAmount = 0;
    uint256 stableAssetDecimals = IERC20Detailed(_stableAsset).decimals();
    for (uint256 i = 0; i < _iterations; i++) {
      borrowAmount = _calcBorrowableAmount(suppliedAmount, _ltv, _stableAsset, stableAssetDecimals);
      if (borrowAmount > 0) {
        // borrow stable coin
        _borrow(_stableAsset, borrowAmount);
        // swap stable coin to collateral
        suppliedAmount = _swapTo(_stableAsset, borrowAmount);
        // supply to LP
        _supply(suppliedAmount);
      }
    }

    emit EnterPosition(_principal, _iterations, _ltv, _stableAsset);
  }

  /**
   * @param _principal - The amount of collateral, uint256 max value should withdraw all collateral
   * @param _slippage - The slippage of the every withdrawal amount. 1% = 100
   * @param _iterations - Loop count
   * @param _stableAsset - The borrowing stable coin address when leverage works
   * @param _sAsset - staked asset address of collateral internal asset
   */
  function leavePosition(
    uint256 _principal,
    uint256 _slippage,
    uint256 _iterations,
    address _stableAsset,
    address _sAsset
  ) public {
    require(_principal > 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(ENABLED_STABLE_COINS[_stableAsset], Errors.LS_STABLE_COIN_NOT_SUPPORTED);
    require(_sAsset != address(0), Errors.LS_INVALID_CONFIGURATION);

    uint256 count;
    do {
      // limit loop count
      require(count < _iterations, Errors.LS_REMOVE_ITERATION_OVER);

      // withdraw collateral
      uint256 availableAmount = _getWithdrawalAmount(_sAsset);
      if (availableAmount == 0) break;

      uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
      uint256 requiredAmount = _principal - collateralAmount;
      uint256 removeAmount = Math.min(availableAmount, requiredAmount);
      IERC20(_sAsset).safeTransferFrom(msg.sender, address(this), removeAmount);
      _remove(removeAmount, _slippage);

      if (removeAmount == requiredAmount) break;

      // swap collateral to stable coin
      // in this case, some collateral asset maybe remained because of convex (ex: sUSD)
      uint256 stableAssetAmount = _swapFrom(_stableAsset);

      // repay
      _repay(_stableAsset, stableAssetAmount);
      uint256 debtAmount = _getDebtAmount(_stableAsset);
      if (debtAmount == 0) {
        // swap stable coin to collateral in case of extra ramined stable coin after repay
        _swapTo(_stableAsset, IERC20(_stableAsset).balanceOf(address(this)));
      }

      count++;
    } while (true);

    // finally deliver the required collateral amount to user
    IERC20(COLLATERAL).safeTransfer(
      msg.sender,
      Math.min(_principal, IERC20(COLLATERAL).balanceOf(address(this)))
    );

    emit LeavePosition(_principal, _stableAsset);
  }

  function _supply(uint256 _amount) internal {
    IGeneralVault(VAULT).depositCollateralFrom(COLLATERAL, _amount, msg.sender);
  }

  function _remove(uint256 _amount, uint256 _slippage) internal {
    IGeneralVault(VAULT).withdrawCollateral(COLLATERAL, _amount, _slippage, address(this));
  }

  function _getWithdrawalAmount(address _sAsset) internal view returns (uint256) {
    // get internal asset address
    address internalAsset = IAToken(_sAsset).UNDERLYING_ASSET_ADDRESS();

    // get reserve info of internal asset
    DataTypes.ReserveConfigurationMap memory configuration = LENDING_POOL.getConfiguration(
      internalAsset
    );
    (, uint256 assetLiquidationThreshold, , , ) = configuration.getParamsMemory();

    // get user info
    (
      uint256 totalCollateralETH,
      uint256 totalDebtETH,
      ,
      uint256 currentLiquidationThreshold,
      ,

    ) = LENDING_POOL.getUserAccountData(msg.sender);

    uint256 withdrawalAmountETH = (totalCollateralETH *
      currentLiquidationThreshold -
      totalDebtETH) / assetLiquidationThreshold;

    return
      Math.min(
        IERC20(_sAsset).balanceOf(msg.sender),
        (withdrawalAmountETH * (10**DECIMALS)) / getAssetPrice(COLLATERAL)
      );
  }

  function _getDebtAmount(address _stableAsset) internal view returns (uint256) {
    // get internal asset's info for user
    DataTypes.ReserveData memory reserve = LENDING_POOL.getReserveData(_stableAsset);

    return IERC20(reserve.variableDebtTokenAddress).balanceOf(msg.sender);
  }

  function _borrow(address _stableAsset, uint256 _amount) internal {
    LENDING_POOL.borrow(_stableAsset, _amount, USE_VARIABLE_DEBT, 0, msg.sender);
  }

  function _repay(address _stableAsset, uint256 _amount) internal {
    IERC20(_stableAsset).safeApprove(address(LENDING_POOL), 0);
    IERC20(_stableAsset).safeApprove(address(LENDING_POOL), _amount);

    LENDING_POOL.repay(_stableAsset, _amount, USE_VARIABLE_DEBT, msg.sender);
  }

  function _calcBorrowableAmount(
    uint256 _collateralAmount,
    uint256 _ltv,
    address _borrowAsset,
    uint256 _assetDecimals
  ) internal view returns (uint256) {
    uint256 availableBorrowsETH = (_collateralAmount * getAssetPrice(COLLATERAL).percentMul(_ltv)) /
      (10**DECIMALS);

    availableBorrowsETH = availableBorrowsETH > SAFE_BUFFER ? availableBorrowsETH - SAFE_BUFFER : 0;

    uint256 availableBorrowsAsset = (availableBorrowsETH * (10**_assetDecimals)) /
      getAssetPrice(_borrowAsset);

    return availableBorrowsAsset;
  }

  function _swapTo(address _stableAsset, uint256 _amount) internal virtual returns (uint256);

  function _swapFrom(address _stableAsset) internal virtual returns (uint256);
}
