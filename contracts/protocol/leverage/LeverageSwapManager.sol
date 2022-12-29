// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {VersionedInitializable} from '../libraries/sturdy-upgradeability/VersionedInitializable.sol';
import {Errors} from '../libraries/helpers/Errors.sol';

contract LeverageSwapManager is VersionedInitializable {
  mapping(address => address) internal _levSwappers;
  ILendingPoolAddressesProvider internal _addressesProvider;

  uint256 private constant REVISION = 0x1;

  modifier onlyAdmin() {
    require(_addressesProvider.getPoolAdmin() == msg.sender, Errors.CALLER_NOT_POOL_ADMIN);
    _;
  }

  /**
   * @dev Emitted when register the leverage swapper address for the collateral reserve asset
   **/
  event RegisterLevSwapper(address collateral, address swapper);

  /**
   * @dev Function is invoked by the proxy contract when the Vault contract is deployed.
   * @param _provider The address of the provider
   **/
  function initialize(ILendingPoolAddressesProvider _provider) external initializer {
    require(address(_provider) != address(0), Errors.LS_INVALID_CONFIGURATION);

    _addressesProvider = _provider;
  }

  function getRevision() internal pure override returns (uint256) {
    return REVISION;
  }

  /**
   * @dev Register the leverage swapper address for the collateral reserve asset
   **/
  function registerLevSwapper(address collateral, address swapper) external onlyAdmin {
    require(collateral != address(0), Errors.LS_INVALID_CONFIGURATION);

    _levSwappers[collateral] = swapper;
    emit RegisterLevSwapper(collateral, swapper);
  }

  function getLevSwapper(address collateral) external view returns (address) {
    address _swapper = _levSwappers[collateral];
    return _swapper;
  }
}
