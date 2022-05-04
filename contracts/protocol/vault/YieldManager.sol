// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {Errors} from '../libraries/helpers/Errors.sol';
import {VersionedInitializable} from '../../protocol/libraries/sturdy-upgradeability/VersionedInitializable.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';

/**
 * @title YieldManager
 * @notice yield distributor by swapping from assets to stable coin
 * @author Sturdy
 **/

contract YieldManager is VersionedInitializable, Ownable {
  using SafeMath for uint256;
  using PercentageMath for uint256;

  struct AssetYield {
    address asset;
    uint256 amount;
  }

  // the list of the available reserves, structured as a mapping for gas savings reasons
  mapping(uint256 => address) internal _assetsList;
  uint256 internal _assetsCount;

  ILendingPoolAddressesProvider internal _addressesProvider;

  uint256 public constant VAULT_REVISION = 0x1;

  modifier onlyAdmin() {
    require(_addressesProvider.getPoolAdmin() == msg.sender, Errors.CALLER_NOT_POOL_ADMIN);
    _;
  }

  /**
   * @dev Function is invoked by the proxy contract when the Vault contract is deployed.
   * @param _provider The address of the provider
   **/
  function initialize(ILendingPoolAddressesProvider _provider) public initializer {
    _addressesProvider = _provider;
  }

  function getRevision() internal pure override returns (uint256) {
    return VAULT_REVISION;
  }

  function registerAsset(address _asset) external onlyOwner {
    _assetsList[_assetsCount] = _asset;
    _assetsCount = _assetsCount + 1;
  }

  /**
   * @dev Distribute the yield of assets to suppliers.
   * @param _offset assets array's start offset.
   * @param _count assets array's count when perform distribution.
   **/
  function distributeYield(uint256 _offset, uint256 _count) external onlyAdmin {
    // 1. convert from all external assets to USDC via uniswap
    // ex: 3CRV -> USDC, WETH -> USDC
    // 2. convert from USDC to other stable assets via curve swap
    // 3. deposit Yield to pool for suppliers
  }

  /**
   * @dev Get the list of asset and asset's yield amount
   **/
  function _getAssetYields(uint256 _totalYieldAmount) internal view returns (AssetYield[] memory) {
    // Get total borrowing asset volume and volumes and assets
    (
      uint256 totalVolume,
      uint256[] memory volumes,
      address[] memory assets,
      uint256 length
    ) = ILendingPool(_addressesProvider.getLendingPool()).getBorrowingAssetAndVolumes();

    if (totalVolume == 0) return new AssetYield[](0);

    AssetYield[] memory assetYields = new AssetYield[](length);
    uint256 extraYieldAmount = _totalYieldAmount;

    for (uint256 i = 0; i < length; i++) {
      assetYields[i].asset = assets[i];
      if (i != length - 1) {
        // Distribute yieldAmount based on percent of asset volume
        assetYields[i].amount = _totalYieldAmount.percentMul(
          volumes[i].mul(PercentageMath.PERCENTAGE_FACTOR).div(totalVolume)
        );
        extraYieldAmount = extraYieldAmount.sub(assetYields[i].amount);
      } else {
        // without calculation, set remained extra amount
        assetYields[i].amount = extraYieldAmount;
      }
    }

    return assetYields;
  }
}
