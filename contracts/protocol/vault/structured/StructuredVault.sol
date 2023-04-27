// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {ReentrancyGuard} from '../../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol';
import {VersionedInitializable} from '../../../protocol/libraries/sturdy-upgradeability/VersionedInitializable.sol';
import {ILendingPoolAddressesProvider} from '../../../interfaces/ILendingPoolAddressesProvider.sol';
import {IGeneralLevSwap} from '../../../interfaces/IGeneralLevSwap.sol';
import {IStructuredVault} from '../../../interfaces/IStructuredVault.sol';
import {ICollateralAdapter} from '../../../interfaces/ICollateralAdapter.sol';
import {ILendingPool} from '../../../interfaces/ILendingPool.sol';
import {ICreditDelegationToken} from '../../../interfaces/ICreditDelegationToken.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {SturdyERC20} from '../../tokenization/SturdyERC20.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {Math} from '../../../dependencies/openzeppelin/contracts/Math.sol';
import {DataTypes} from '../../../protocol/libraries/types/DataTypes.sol';
import {ReserveConfiguration} from '../../../protocol/libraries/configuration/ReserveConfiguration.sol';
import {BalancerswapAdapter2} from '../../libraries/swap/BalancerswapAdapter2.sol';
import {UniswapAdapter2} from '../../libraries/swap/UniswapAdapter2.sol';
import {CurveswapAdapter2} from '../../libraries/swap/CurveswapAdapter2.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';

/**
 * @title StructuredVault
 * @notice Basic feature of structured vault
 * @author Sturdy
 **/

abstract contract StructuredVault is VersionedInitializable, ReentrancyGuard, SturdyERC20 {
  using SafeERC20 for IERC20;
  using Math for uint256;
  using PercentageMath for uint256;
  using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

  uint256 private constant VAULT_REVISION = 0x1;
  uint256 private constant DEFAULT_INDEX = 1e18;

  /// @notice The structured vault's underlying asset ex: USDC/USDT/DAI
  address private _underlyingAsset;

  /// @notice The share token index (decimal 18)
  uint256 private _shareIndex;

  /// @notice The sturdy's address provider
  ILendingPoolAddressesProvider private _addressesProvider;

  /// @notice The structured vault's fee.  1% = 100
  uint256 private _fee;

  /// @notice The structured vault's minimum swap loss. 1% = 100
  uint256 private _swapLoss;

  /**
   * @dev Emitted on deposit()
   * @param user The user address
   * @param amount The user's deposit amount
   **/
  event Deposit(address indexed user, uint256 amount);

  /**
   * @dev Emitted on withdraw()
   * @param user The user address
   * @param amount The user's withdrawal amount
   **/
  event Withdraw(address indexed user, uint256 amount);

  modifier onlyAdmin() {
    require(_addressesProvider.getPoolAdmin() == msg.sender, Errors.CALLER_NOT_POOL_ADMIN);
    _;
  }

  constructor() SturdyERC20('Sturdy Structured LP Token', 'structured-lp', 18) {}

  /**
   * @dev Function is invoked by the proxy contract when the Vault contract is deployed.
   * - Caller is initializer (LendingPoolAddressesProvider or deployer)
   * @param _provider The address of the provider
   **/
  function initialize(
    ILendingPoolAddressesProvider _provider,
    address _underlying,
    string memory name,
    string memory symbol,
    uint8 decimals
  ) external initializer {
    require(address(_provider) != address(0), Errors.VT_INVALID_CONFIGURATION);

    _addressesProvider = _provider;
    _shareIndex = DEFAULT_INDEX;
    _underlyingAsset = _underlying;

    _setName(name);
    _setSymbol(symbol);
    _setDecimals(decimals);
  }

  function getRevision() internal pure override returns (uint256) {
    return VAULT_REVISION;
  }

  /**
   * @dev Deposits an `_amount` of underlying asset.
   * - Caller is anyone
   * @param _from The depositor address
   * @param _amount The deposit amount
   */
  function deposit(address _from, uint256 _amount) external nonReentrant {
    require(_from != address(0), Errors.VT_INVALID_CONFIGURATION);
    require(_amount != 0, Errors.VT_INVALID_CONFIGURATION);

    // Receive the underlying assets from user
    IERC20(_underlyingAsset).safeTransferFrom(_from, address(this), _amount);

    uint256 share = _amount.mulDiv(DEFAULT_INDEX, _shareIndex, Math.Rounding.Down);
    require(share != 0, Errors.CT_INVALID_MINT_AMOUNT);

    _mint(_from, share);

    emit Deposit(_from, _amount);
  }

  /**
   * @dev Withdraws an `_amount` of underlying asset. 
          If vault has not enough, then perform the deleverage and migration to underlying asset
   * - Caller is anyone
   * @param _to The address that will receive the underlying asset, same as msg.sender if the user
   *   wants to receive it on his own wallet, or a different address if the beneficiary is a
   *   different wallet
   * @param _amount The withdrawal amount
   * @param _params - The params to perform the deleverage and migration to underlying asset
   */
  function withdraw(
    address _to,
    uint256 _amount,
    IStructuredVault.AutoExitPositionParams calldata _params
  ) external nonReentrant {
    require(_to != address(0), Errors.VT_INVALID_CONFIGURATION);
    require(_amount != 0, Errors.VT_INVALID_CONFIGURATION);

    address from = _msgSender();
    uint256 share = super.balanceOf(from);
    uint256 amountToWithdraw = _amount;

    if (_amount == type(uint256).max) {
      // withdraw 100% case
      amountToWithdraw = share.mulDiv(_shareIndex, DEFAULT_INDEX, Math.Rounding.Down);
    } else {
      share = _amount.mulDiv(DEFAULT_INDEX, _shareIndex, Math.Rounding.Down);
    }

    require(share != 0, Errors.CT_INVALID_BURN_AMOUNT);

    // Check vault has enough underlying asset to withdraw
    // If not, perform auto exit position.
    address underlyingAsset = _underlyingAsset;
    uint256 underlyingAmount = IERC20(underlyingAsset).balanceOf(address(this));
    if (underlyingAmount < amountToWithdraw) {
      _autoExitAndMigration(amountToWithdraw - underlyingAmount, _params);
    }

    _burn(from, share);

    // Send asset to user
    IERC20(underlyingAsset).safeTransfer(_to, amountToWithdraw);

    emit Withdraw(_to, amountToWithdraw);
  }

  /**
   * @dev Set the vault fee
   * - Caller is Admin
   * @param fee_ - The fee percentage value. ex 1% = 100
   */
  function setFee(uint256 fee_) external payable onlyAdmin {
    require(fee_ < 100_00, Errors.VT_FEE_TOO_BIG);

    _fee = fee_;
  }

  /**
   * @dev Set the vault minimum swap loss
   * - Caller is Admin
   * @param swapLoss_ - The minimum swap loss percentage value. ex 1% = 100
   */
  function setSwapLoss(uint256 swapLoss_) external payable onlyAdmin {
    require(swapLoss_ < 100_00, Errors.VT_FEE_TOO_BIG);

    _swapLoss = swapLoss_;
  }

  /**
   * @dev Authorize the leverage/deleverage contract to handle the collateral, debt and staked internal asset.
   * - Caller is Admin
   * @param _collateralAsset - The collateral external asset address
   * @param _swapper - The leverage/deleverage contract address
   */
  function authorizeSwapper(address _collateralAsset, address _swapper) external payable onlyAdmin {
    address internalAsset = ICollateralAdapter(_addressesProvider.getAddress('COLLATERAL_ADAPTER'))
      .getInternalCollateralAsset(_collateralAsset);
    DataTypes.ReserveData memory reserve = ILendingPool(_addressesProvider.getLendingPool())
      .getReserveData(internalAsset);

    // approve collateral asset
    IERC20(_collateralAsset).safeApprove(_swapper, 0);
    if (IERC20(_collateralAsset).allowance(address(this), _swapper) == 0) {
      IERC20(_collateralAsset).safeApprove(_swapper, type(uint256).max);
    }

    // approve debt asset
    ICreditDelegationToken(reserve.variableDebtTokenAddress).approveDelegation(
      _swapper,
      type(uint256).max
    );

    // approve staked asset
    address sAsset = reserve.aTokenAddress;
    IERC20(sAsset).safeApprove(_swapper, 0);
    if (IERC20(sAsset).allowance(address(this), _swapper) == 0) {
      IERC20(sAsset).safeApprove(_swapper, type(uint256).max);
    }
  }

  /**
   * @dev Leverage an `_amount` of collateral asset via `_swapper`.
   * - Caller is Admin
   * @param _swapper - The leverage/deleverage contract address
   * @param _amount - The amount of collateral
   * @param _leverage - Extra leverage value and must be greater than 0, ex. 300% = 300_00
   *                    _amount + _amount * _leverage should be used as collateral
   * @param _borrowAsset - The borrowing asset address when leverage works
   * @param _flashLoanType - 0 is Aave, 1 is Balancer
   * @param _zapPaths - The uniswap/balancer/curve swap paths between underlying asset and collateral
   * @param _zapPathLength - The uniswap/balancer/curve swap path length between underlying asset and collateral
                             if this value is 0, it means normal leverage if not, it means zapLeverage
   * @param _swapInfo - The uniswap/balancer/curve swap paths between borrowAsset and collateral
   */
  function enterPosition(
    address _swapper,
    uint256 _amount,
    uint256 _leverage,
    address _borrowAsset,
    IGeneralLevSwap.FlashLoanType _flashLoanType,
    IGeneralLevSwap.MultipSwapPath[3] calldata _zapPaths,
    uint256 _zapPathLength,
    IGeneralLevSwap.SwapInfo calldata _swapInfo
  ) external payable onlyAdmin {
    require(_swapper != address(0), Errors.VT_INVALID_CONFIGURATION);

    address collateralAsset = IGeneralLevSwap(_swapper).COLLATERAL();
    IERC20(collateralAsset).safeTransferFrom(_msgSender(), address(this), _amount);

    if (_zapPathLength != 0) {
      IGeneralLevSwap(_swapper).zapLeverageWithFlashloan(
        _underlyingAsset,
        _amount,
        _leverage,
        _borrowAsset,
        _flashLoanType,
        _zapPaths,
        _zapPathLength,
        _swapInfo
      );
    } else {
      IGeneralLevSwap(_swapper).enterPositionWithFlashloan(
        _amount,
        _leverage,
        _borrowAsset,
        _flashLoanType,
        _swapInfo
      );
    }
  }

  /**
   * @dev Deleverage an `_requiredAmount` of collateral asset via `_swapper`.
   * - Caller is Admin
   * @param _swapper -  The leverage/deleverage contract address
   * @param _repayAmount - The amount of repay
   * @param _requiredAmount - The amount of collateral
   * @param _borrowAsset - The borrowing asset address when leverage works
   * @param _sAsset - staked asset address of collateral internal asset
   * @param _flashLoanType - 0 is Aave, 1 is Balancer
   * @param _swapInfo - The uniswap/balancer/curve swap infos between borrowAsset and collateral
   */
  function exitPosition(
    address _swapper,
    uint256 _repayAmount,
    uint256 _requiredAmount,
    address _borrowAsset,
    address _sAsset,
    IGeneralLevSwap.FlashLoanType _flashLoanType,
    IGeneralLevSwap.SwapInfo calldata _swapInfo
  ) external payable onlyAdmin {
    require(_swapper != address(0), Errors.VT_INVALID_CONFIGURATION);

    IGeneralLevSwap(_swapper).withdrawWithFlashloan(
      _repayAmount,
      _requiredAmount,
      _borrowAsset,
      _sAsset,
      _flashLoanType,
      _swapInfo
    );
  }

  /**
   * @dev Migration between collateral assets or underlying asset.
   * - Caller is Admin
   * @param _amount - The migration amount of `from` collateral address.
   * @param _paths - The uniswap/balancer/curve swap paths between from asset and to asset
   * @param _pathLength - The uniswap/balancer/curve swap path length between from asset and to asset
   */
  function migration(
    uint256 _amount,
    IGeneralLevSwap.MultipSwapPath[5] calldata _paths,
    uint256 _pathLength
  ) external payable onlyAdmin {
    _migration(_amount, _paths, _pathLength);
  }

  /**
   * @return The structured vault's fee
   */
  function getFee() external view returns (uint256) {
    return _fee;
  }

  /**
   * @return The structured vault's minimum swap loss percentage value
   */
  function getSwapLoss() external view returns (uint256) {
    return _swapLoss;
  }

  /**
   * @dev The function to get underlying asset address
   * @return The address of underlying asset
   */
  function getUnderlyingAsset() external view returns (address) {
    return _underlyingAsset;
  }

  /**
   * @return The total supply of the token
   **/
  function totalSupply() public view override returns (uint256) {
    uint256 currentTotalShares = super.totalSupply();

    if (currentTotalShares == 0) {
      return 0;
    }

    return currentTotalShares.mulDiv(_shareIndex, DEFAULT_INDEX, Math.Rounding.Down);
  }

  /**
   * @return The balance of the token
   **/
  function balanceOf(address account) public view override returns (uint256) {
    return super.balanceOf(account).mulDiv(_shareIndex, DEFAULT_INDEX, Math.Rounding.Down);
  }

  /**
   * @return The scaled total supply of the token
   **/
  function scaledTotalSupply() external view returns (uint256) {
    return super.totalSupply();
  }

  /**
   * @return The scaled balance of the token
   **/
  function scaledBalanceOf(address account) external view returns (uint256) {
    return super.balanceOf(account);
  }

  /**
   * @return The share index
   **/
  function getRate() external view returns (uint256) {
    return _shareIndex;
  }

  function _autoExitAndMigration(
    uint256 _requiredUnderlyingAmount,
    IStructuredVault.AutoExitPositionParams calldata _params
  ) internal {
    require(_params.swapper != address(0), Errors.VT_INVALID_CONFIGURATION);
    address collateralAsset = IGeneralLevSwap(_params.swapper).COLLATERAL();
    IStructuredVault.AssetInfo memory collateral = _getAssetInfo(collateralAsset);
    IStructuredVault.AssetInfo memory underlying = _getAssetInfo(_underlyingAsset);

    uint256 maxRequiredAmountPrice = _requiredUnderlyingAmount
      .mulDiv(underlying.price, 10 ** underlying.decimals, Math.Rounding.Down)
      .percentMul(PercentageMath.PERCENTAGE_FACTOR + _swapLoss);

    uint256 requiredCollateralAmount = maxRequiredAmountPrice.mulDiv(
      10 ** collateral.decimals,
      collateral.price,
      Math.Rounding.Down
    );
    uint256 repayAmount = _getRepayAmount(collateralAsset, maxRequiredAmountPrice, underlying);

    //deleverage call
    // migration call
  }

  function _migration(
    uint256 _amount,
    IGeneralLevSwap.MultipSwapPath[5] calldata _paths,
    uint256 _pathLength
  ) internal returns (uint256) {
    require(_pathLength > 0, Errors.VT_INVALID_CONFIGURATION);
    require(_amount != 0, Errors.VT_INVALID_CONFIGURATION);

    uint256 fromAssetAmount = IERC20(_paths[0].swapFrom).balanceOf(address(this));
    require(fromAssetAmount >= _amount, Errors.VT_INVALID_CONFIGURATION);

    uint256 amount = _amount;
    for (uint256 i; i < _pathLength; ++i) {
      if (_paths[i].swapType == IGeneralLevSwap.SwapType.NONE) continue;
      amount = _processSwap(amount, _paths[i]);
    }

    return amount;
  }

  function _swapByPath(
    uint256 _fromAmount,
    IGeneralLevSwap.MultipSwapPath memory _path
  ) internal returns (uint256) {
    uint256 poolCount = _path.poolCount;
    require(poolCount > 0, Errors.LS_INVALID_CONFIGURATION);

    if (_path.swapType == IGeneralLevSwap.SwapType.BALANCER) {
      // Balancer Swap
      BalancerswapAdapter2.Path memory path;
      path.tokens = new address[](poolCount + 1);
      path.poolIds = new bytes32[](poolCount);

      for (uint256 i; i < poolCount; ++i) {
        path.tokens[i] = _path.routes[i * 2];
        path.poolIds[i] = bytes32(_path.routeParams[i][0]);
      }
      path.tokens[poolCount] = _path.routes[poolCount * 2];

      return
        BalancerswapAdapter2.swapExactTokensForTokens(
          _path.swapFrom,
          _path.swapTo,
          _fromAmount,
          path,
          _path.outAmount
        );
    }

    if (_path.swapType == IGeneralLevSwap.SwapType.UNISWAP) {
      // UniSwap
      UniswapAdapter2.Path memory path;
      path.tokens = new address[](poolCount + 1);
      path.fees = new uint256[](poolCount);

      for (uint256 i; i < poolCount; ++i) {
        path.tokens[i] = _path.routes[i * 2];
        path.fees[i] = _path.routeParams[i][0];
      }
      path.tokens[poolCount] = _path.routes[poolCount * 2];

      return
        UniswapAdapter2.swapExactTokensForTokens(
          _addressesProvider,
          _path.swapFrom,
          _path.swapTo,
          _fromAmount,
          path,
          _path.outAmount
        );
    }

    // Curve Swap
    return
      CurveswapAdapter2.swapExactTokensForTokens(
        _addressesProvider,
        _path.swapFrom,
        _path.swapTo,
        _fromAmount,
        CurveswapAdapter2.Path(_path.routes, _path.routeParams),
        _path.outAmount
      );
  }

  function _getRepayAmount(
    address _collateralAsset,
    uint256 _maxRequiredAmountPrice,
    IStructuredVault.AssetInfo memory _underlying
  ) internal view returns (uint256) {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    ILendingPool lendingPool = ILendingPool(provider.getLendingPool());
    address internalAsset = ICollateralAdapter(provider.getAddress('COLLATERAL_ADAPTER'))
      .getInternalCollateralAsset(_collateralAsset);
    DataTypes.ReserveData memory reserve = lendingPool.getReserveData(internalAsset);

    (, , , , , uint256 healthFactor) = lendingPool.getUserAccountData(address(this));
    (, uint256 reserveLiquidationThreshold, , , ) = reserve.configuration.getParamsMemory();

    uint256 K = PercentageMath.PERCENTAGE_FACTOR + _swapLoss;
    uint256 repayAmountPrice = (_maxRequiredAmountPrice * reserveLiquidationThreshold).mulDiv(
      1e14,
      healthFactor - K * reserveLiquidationThreshold * 1e10,
      Math.Rounding.Down
    );

    return
      repayAmountPrice.mulDiv(10 ** _underlying.decimals, _underlying.price, Math.Rounding.Down);
  }

  function _getAssetInfo(
    address _assetAddress
  ) internal view returns (IStructuredVault.AssetInfo memory) {
    return
      IStructuredVault.AssetInfo(
        IPriceOracleGetter(_addressesProvider.getPriceOracle()).getAssetPrice(_assetAddress),
        IERC20Detailed(_assetAddress).decimals()
      );
  }

  function _processSwap(
    uint256,
    IGeneralLevSwap.MultipSwapPath memory
  ) internal virtual returns (uint256);
}
