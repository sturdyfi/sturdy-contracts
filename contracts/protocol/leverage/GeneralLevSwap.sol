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

  /**
   * @param asset The external asset ex. wFTM
   * @param vault The deployed vault address
   * @param _provider The deployed AddressProvider
   */
  constructor(
    address asset,
    address vault,
    address _provider
  ) {
    require(
      asset != address(0) && _provider != address(0) && vault != address(0),
      Errors.LS_INVALID_CONFIGURATION
    );

    COLLATERAL = asset;
    DECIMALS = IERC20Detailed(asset).decimals();
    VAULT = vault;
    _addressesProvider = ILendingPoolAddressesProvider(_provider);
    IERC20(COLLATERAL).approve(vault, type(uint256).max);
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
   * @param principal - The amount of collateral
   * @param iterations - Loop count
   * @param ltv - The loan to value of the asset in 4 decimals ex. 82.5% == 8250
   * @param stableAsset - The borrowing stable asset address when leverage works
   */
  function enterPosition(
    uint256 principal,
    uint256 iterations,
    uint256 ltv,
    address stableAsset
  ) public {
    require(principal > 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(ENABLED_STABLE_COINS[stableAsset], Errors.LS_STABLE_COIN_NOT_SUPPORTED);
    require(IERC20(COLLATERAL).balanceOf(msg.sender) >= principal, Errors.LS_SUPPLY_NOT_ALLOWED);

    IERC20(COLLATERAL).safeTransferFrom(msg.sender, address(this), principal);

    _supply(principal);

    uint256 _suppliedAmount = principal;
    uint256 _borrowAmount = 0;
    uint256 _stableAssetDecimals = IERC20Detailed(stableAsset).decimals();
    for (uint256 i = 0; i < iterations; i++) {
      _borrowAmount = _calcBorrowableAmount(
        _suppliedAmount,
        ltv,
        stableAsset,
        _stableAssetDecimals
      );
      if (_borrowAmount > 0) {
        // borrow stable coin
        _borrow(stableAsset, _borrowAmount);
        // swap stable coin to collateral
        _suppliedAmount = _swap(stableAsset, _borrowAmount);
        // supply to LP
        _supply(_suppliedAmount);
      }
    }

    emit EnterPosition(principal, iterations, ltv, stableAsset);
  }

  function _supply(uint256 amount) internal {
    GeneralVault(VAULT).depositCollateralFrom(COLLATERAL, amount, msg.sender);
  }

  function _borrow(address stableAsset, uint256 amount) internal {
    ILendingPool(_addressesProvider.getLendingPool()).borrow(
      stableAsset,
      amount,
      USE_VARIABLE_DEBT,
      0,
      msg.sender
    );
  }

  function _calcBorrowableAmount(
    uint256 collateralAmount,
    uint256 ltv,
    address borrowAsset,
    uint256 assetDecimals
  ) internal view returns (uint256) {
    uint256 availableBorrowsETH = (collateralAmount * getAssetPrice(COLLATERAL).percentMul(ltv)) /
      (10**DECIMALS);

    availableBorrowsETH = availableBorrowsETH > SAFE_BUFFER ? availableBorrowsETH - SAFE_BUFFER : 0;

    uint256 availableBorrowsAsset = (availableBorrowsETH * (10**assetDecimals)) /
      getAssetPrice(borrowAsset);

    return availableBorrowsAsset;
  }

  function _swap(address, uint256) internal virtual returns (uint256) {
    return 0;
  }
}
