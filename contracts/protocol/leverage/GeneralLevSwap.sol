// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {VersionedInitializable} from '../libraries/sturdy-upgradeability/VersionedInitializable.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IERC20Detailed} from '../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {IPriceOracleGetter} from '../../interfaces/IPriceOracleGetter.sol';
import {ICollateralAdapter} from '../../interfaces/ICollateralAdapter.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {ReserveConfiguration} from '../libraries/configuration/ReserveConfiguration.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import {DataTypes} from '../libraries/types/DataTypes.sol';
import {GeneralVault} from '../vault/GeneralVault.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import 'hardhat/console.sol';

contract GeneralLevSwap {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;
  using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

  uint256 public constant USE_VARIABLE_DEBT = 2;

  address public immutable COLLATERAL; // The addrss of external asset
  address public immutable VAULT; // The address of vault
  ILendingPoolAddressesProvider internal _addressesProvider;

  uint256 public constant SAFE_BUFFER = 1000;

  mapping(address => bool) ENABLED_STABLE_COINS;

  event EnterPosition(uint256 amount, uint256 iterations, address indexed borrowedCoin);

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
   * @return LTV of ASSET in 4 decimals ex. 82.5% == 8250
   */
  function getLTV() public view returns (uint256 LTV) {
    ICollateralAdapter collateralAdapter = ICollateralAdapter(
      _addressesProvider.getAddress('COLLATERAL_ADAPTER')
    );
    address internalAsset = collateralAdapter.getInternalCollateralAsset(COLLATERAL);

    DataTypes.ReserveConfigurationMap memory configuration = ILendingPool(
      _addressesProvider.getLendingPool()
    ).getConfiguration(internalAsset);

    (LTV, , , , ) = configuration.getParamsMemory();
  }

  function getAToken() public view returns (address) {
    ICollateralAdapter collateralAdapter = ICollateralAdapter(
      _addressesProvider.getAddress('COLLATERAL_ADAPTER')
    );
    address internalAsset = collateralAdapter.getInternalCollateralAsset(COLLATERAL);

    DataTypes.ReserveData memory reserve = ILendingPool(_addressesProvider.getLendingPool())
      .getReserveData(internalAsset);

    return reserve.aTokenAddress;
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
   * @param stableAsset - The stable coin address to borrow when leverage works
   */
  function enterPosition(
    uint256 principal,
    uint256 iterations,
    address stableAsset
  ) public {
    require(principal > 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(ENABLED_STABLE_COINS[stableAsset], Errors.LS_STABLE_COIN_NOT_SUPPORTED);
    require(
      IERC20Detailed(COLLATERAL).balanceOf(msg.sender) >= principal,
      Errors.LS_SUPPLY_NOT_ALLOWED
    );

    IERC20(COLLATERAL).safeTransferFrom(msg.sender, address(this), principal);

    _supply(principal);

    uint256 _suppliedAmount = principal;
    uint256 _borrowAmount = 0;
    for (uint256 i = 0; i < iterations; i++) {
      _borrowAmount = _calcBorrowableAmount(_suppliedAmount, stableAsset);
      if (_borrowAmount > 0) {
        // borrow stable coin
        _borrow(stableAsset, _borrowAmount);
        // swap stable coin to collateral
        _suppliedAmount = _swap(stableAsset, _borrowAmount);
        // supply to LP
        _supply(_suppliedAmount);
      }
    }

    emit EnterPosition(principal, iterations, stableAsset);
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

  function _calcBorrowableAmount(uint256 collateralAmount, address borrowAsset)
    internal
    view
    returns (uint256)
  {
    uint256 ltv = getLTV();
    uint256 availableBorrowsETH = (collateralAmount *
      getAssetPrice(COLLATERAL).percentMul(ltv).percentMul(99_00)) /
      (10**IERC20Detailed(COLLATERAL).decimals());

    uint256 availableBorrowsAsset = (availableBorrowsETH *
      (10**IERC20Detailed(borrowAsset).decimals())) / getAssetPrice(borrowAsset);
    return availableBorrowsAsset;
  }

  function _swap(address stableAsset, uint256 _swapAmount) internal virtual returns (uint256) {
    return 0;
  }
}
