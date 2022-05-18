// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {Errors} from '../libraries/helpers/Errors.sol';
import {VersionedInitializable} from '../../protocol/libraries/sturdy-upgradeability/VersionedInitializable.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {IPriceOracleGetter} from '../../interfaces/IPriceOracleGetter.sol';
import {ISwapRouter} from '../../interfaces/ISwapRouter.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IERC20Detailed} from '../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {TransferHelper} from '../libraries/helpers/TransferHelper.sol';
import {UniswapAdapter} from '../libraries/swap/UniswapAdapter.sol';
import {CurveswapAdapter} from '../libraries/swap/CurveswapAdapter.sol';

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

  uint256 private constant REVISION = 0x1;

  address public _exchangeToken;

  // tokenIn -> tokenOut -> Curve Pool Address
  mapping(address => mapping(address => address)) internal _curvePools;

  uint256 private constant UNISWAP_FEE = 10000; // 1%
  uint256 private constant SLIPPAGE = 500; // 5%

  modifier onlyAdmin() {
    require(_addressesProvider.getPoolAdmin() == msg.sender, Errors.CALLER_NOT_POOL_ADMIN);
    _;
  }

  /**
   * @dev Function is invoked by the proxy contract when the Vault contract is deployed.
   * @param _provider The address of the provider
   **/
  function initialize(ILendingPoolAddressesProvider _provider) external initializer {
    _addressesProvider = _provider;
  }

  function setExchangeToken(address _token) external payable onlyAdmin {
    require(_token != address(0), Errors.VT_INVALID_CONFIGURATION);
    _exchangeToken = _token;
  }

  function getRevision() internal pure override returns (uint256) {
    return REVISION;
  }

  function registerAsset(address _asset) external payable onlyAdmin {
    _assetsList[_assetsCount] = _asset;
    _assetsCount += 1;
  }

  function unregisterAsset(address _asset, uint256 _index) external payable onlyAdmin {
    uint256 count = _assetsCount;
    require(_index < count, Errors.VT_INVALID_CONFIGURATION);

    count -= 1;
    if (_index == count) return;

    _assetsList[_index] = _assetsList[count];
    _assetsCount = count;
  }

  function getAssetCount() external view returns (uint256) {
    return _assetsCount;
  }

  function getAssetInfo(uint256 _index) external view returns (address) {
    return _assetsList[_index];
  }

  /**
   * @dev Function to set Curve Pool address for the swap
   * @param _tokenIn The address of token being exchanged
   * @param _tokenOut The address of token being received
   * @param _pool The address of the Curve pool to use for the swap
   */
  function setCurvePool(
    address _tokenIn,
    address _tokenOut,
    address _pool
  ) external payable onlyAdmin {
    require(_pool != address(0), Errors.VT_INVALID_CONFIGURATION);
    _curvePools[_tokenIn][_tokenOut] = _pool;
  }

  /**
   * @dev Function to get Curve Pool address for the swap
   * @param _tokenIn The address of token being sent
   * @param _tokenOut The address of token being received
   */
  function getCurvePool(address _tokenIn, address _tokenOut) external view returns (address) {
    return _curvePools[_tokenIn][_tokenOut];
  }

  /**
   * @dev Distribute the yield of assets to suppliers.
   *      1. convert asset to exchange token(for now it's USDC) via Uniswap
   *      2. convert exchange token to other stables via Curve
   *      3. deposit to pool for suppliers
   * @param _offset assets array's start offset.
   * @param _count assets array's count when perform distribution.
   **/
  function distributeYield(uint256 _offset, uint256 _count) external payable onlyAdmin {
    address token = _exchangeToken;
    ILendingPoolAddressesProvider provider = _addressesProvider;

    // 1. convert from asset to exchange token via uniswap
    for (uint256 i; i < _count; ++i) {
      address asset = _assetsList[_offset + i];
      require(asset != address(0), Errors.UL_INVALID_INDEX);
      uint256 amount = IERC20Detailed(asset).balanceOf(address(this));
      UniswapAdapter.swapExactTokensForTokens(
        provider,
        asset,
        token,
        amount,
        UNISWAP_FEE,
        SLIPPAGE
      );
    }
    uint256 exchangedAmount = IERC20Detailed(token).balanceOf(address(this));

    // 2. convert from exchange token to other stable assets via curve swap
    AssetYield[] memory assetYields;
    (
      uint256 totalVolume,
      uint256[] memory volumes,
      address[] memory assets,
      uint256 length
    ) = ILendingPool(provider.getLendingPool()).getBorrowingAssetAndVolumes();

    if (totalVolume == 0) assetYields = new AssetYield[](0);

    assetYields = new AssetYield[](length);
    uint256 extraYieldAmount = exchangedAmount;

    for (uint256 i; i < length; ++i) {
      assetYields[i].asset = assets[i];
      if (i != length - 1) {
        // Distribute yieldAmount based on percent of asset volume
        assetYields[i].amount = exchangedAmount.percentMul(
          volumes[i].mul(PercentageMath.PERCENTAGE_FACTOR).div(totalVolume)
        );
        extraYieldAmount = extraYieldAmount.sub(assetYields[i].amount);
      } else {
        // without calculation, set remained extra amount
        assetYields[i].amount = extraYieldAmount;
      }
    }

    length = assetYields.length;
    for (uint256 i; i < length; ++i) {
      if (assetYields[i].amount > 0) {
        uint256 amount;

        if (assetYields[i].asset == token) {
          amount = assetYields[i].amount;
        } else {
          address pool = _curvePools[token][assetYields[i].asset];
          require(pool != address(0), Errors.VT_INVALID_CONFIGURATION);
          amount = CurveswapAdapter.swapExactTokensForTokens(
            provider,
            pool,
            token,
            assetYields[i].asset,
            assetYields[i].amount,
            SLIPPAGE
          );
        }
        // 3. deposit Yield to pool for suppliers
        address _lendingPool = provider.getLendingPool();
        IERC20(assetYields[i].asset).approve(_lendingPool, amount);
        ILendingPool(_lendingPool).depositYield(assetYields[i].asset, amount);
      }
    }
  }
}
