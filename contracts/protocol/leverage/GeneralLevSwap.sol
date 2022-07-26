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
import {GeneralVault} from '../vault/GeneralVault.sol';
import {Errors} from '../libraries/helpers/Errors.sol';

contract GeneralLevSwap {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  uint256 public constant USE_VARIABLE_DEBT = 2;

  address public immutable COLLATERAL; // The addrss of external asset

  uint256 public immutable DECIMALS; // The collateral decimals

  address public immutable VAULT; // The address of vault

  ILendingPoolAddressesProvider internal _addressesProvider;

  uint256 public constant SAFE_BUFFER = 5000;

  mapping(address => bool) ENABLED_STABLE_COINS;

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
    _addressesProvider = ILendingPoolAddressesProvider(_provider);
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
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    return oracle.getAssetPrice(_asset);
  }

  /**
   * @param _principal - The amount of collateral
   * @param _iterations - Loop count
   * @param _ltv - The loan to value of the asset in 4 decimals ex. 82.5% == 8250
   * @param _stableAsset - The borrowing stable asset address when leverage works
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
        suppliedAmount = _swap(_stableAsset, borrowAmount);
        // supply to LP
        _supply(suppliedAmount);
      }
    }

    emit EnterPosition(_principal, _iterations, _ltv, _stableAsset);
  }

  /**
   * @param _principal - The amount of collateral
   * @param _slippage - The slippage of the every withdrawal amount. 1% = 100
   * @param _stableAsset - The borrowing stable asset address when leverage works
   */
  function leavePosition(
    uint256 _principal,
    uint256 _slippage,
    address _stableAsset
  ) public {
    require(_principal > 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(ENABLED_STABLE_COINS[_stableAsset], Errors.LS_STABLE_COIN_NOT_SUPPORTED);

    _remove(_principal, _slippage);

    emit LeavePosition(_principal, _stableAsset);
  }

  function _supply(uint256 _amount) internal {
    GeneralVault(VAULT).depositCollateralFrom(COLLATERAL, _amount, msg.sender);
  }

  function _remove(uint256 _amount, uint256 _slippage) internal {
    GeneralVault(VAULT).withdrawCollateral(COLLATERAL, _amount, _slippage, address(this));
  }

  function _borrow(address _stableAsset, uint256 _amount) internal {
    ILendingPool(_addressesProvider.getLendingPool()).borrow(
      _stableAsset,
      _amount,
      USE_VARIABLE_DEBT,
      0,
      msg.sender
    );
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

  function _swap(address, uint256) internal virtual returns (uint256) {
    return 0;
  }
}
