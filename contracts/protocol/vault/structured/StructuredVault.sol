// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {ReentrancyGuard} from '../../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol';
import {VersionedInitializable} from '../../../protocol/libraries/sturdy-upgradeability/VersionedInitializable.sol';
import {ILendingPoolAddressesProvider} from '../../../interfaces/ILendingPoolAddressesProvider.sol';
import {IGeneralLevSwap} from '../../../interfaces/IGeneralLevSwap.sol';
import {IStructuredVault} from '../../../interfaces/IStructuredVault.sol';
import {ICollateralAdapter} from '../../../interfaces/ICollateralAdapter.sol';
import {ILendingPool} from '../../../interfaces/ILendingPool.sol';
import {IVariableYieldDistribution} from '../../../interfaces/IVariableYieldDistribution.sol';
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

abstract contract StructuredVault is
  IStructuredVault,
  VersionedInitializable,
  ReentrancyGuard,
  SturdyERC20
{
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

  /// @notice The structured vault's admin address
  address private _admin;

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

  /**
   * @dev Emitted on enterPosition()
   * @param swapper The swapper address
   * @param borrowAsset The borrowing asset
   * @param amount The leverage amount
   * @param leverage The leverage percentage value
   **/
  event EnterPostion(
    address indexed swapper,
    address indexed borrowAsset,
    uint256 amount,
    uint256 leverage
  );

  /**
   * @dev Emitted on exitPosition()
   * @param swapper The swapper address
   * @param borrowAsset The borrowing asset
   * @param repayAmount The repay amount
   * @param amount The amount of deleverage
   **/
  event ExitPostion(
    address indexed swapper,
    address indexed borrowAsset,
    uint256 repayAmount,
    uint256 amount
  );

  /**
   * @dev Emitted on Migration()
   * @param fromAsset The migration from asset address
   * @param toAsset The migration to asset address
   * @param fromAmount The migration from amount
   * @param toAmount The migration result amount
   **/
  event Migration(
    address indexed fromAsset,
    address indexed toAsset,
    uint256 fromAmount,
    uint256 toAmount
  );

  /**
   * @dev Emitted on processYield()
   * @param sAssets The staked asset addresses of collateral internal asset to claim yield
   * @param oldShareIndex The share index before process yield
   * @param newShareIndex The share index after process yield
   **/
  event ProcessYield(address[] indexed sAssets, uint256 oldShareIndex, uint256 newShareIndex);

  modifier onlyAdmin() {
    require(_admin == msg.sender, Errors.CALLER_NOT_POOL_ADMIN);
    _;
  }

  constructor() SturdyERC20('Sturdy Structured LP Token', 'SS-LP', 18) {}

  /**
   * @dev Function is invoked by the proxy contract when the Vault contract is deployed.
   * - Caller is initializer (LendingPoolAddressesProvider or deployer)
   * @param _provider The address of the provider
   **/
  function initialize(ILendingPoolAddressesProvider _provider) external initializer {
    require(address(_provider) != address(0), Errors.VT_INVALID_CONFIGURATION);

    _addressesProvider = _provider;
    _shareIndex = DEFAULT_INDEX;
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
   * @dev Set underlying asset address and lptoken info
   * - Caller is vault Admin
   * @param _underlying - The underlying asset address (ex: USDC/USDT/DAI/WETH)
   * @param _name - The vault's lptoken name
   * @param _symbol - The vault's lptoken symbol
   * @param _decimals - The vault's lptoken decimals
   */
  function initUnderlyingAsset(
    address _underlying,
    string memory _name,
    string memory _symbol,
    uint8 _decimals
  ) external payable onlyAdmin {
    require(_underlying != address(0), Errors.VT_INVALID_CONFIGURATION);
    if (_underlyingAsset == address(0)) {
      _underlyingAsset = _underlying;
    }

    _setName(_name);
    _setSymbol(_symbol);
    _setDecimals(_decimals);
  }

  /**
   * @dev Set the vault fee
   * - Caller is vault Admin
   * @param fee_ - The fee percentage value. ex 1% = 100
   */
  function setFee(uint256 fee_) external payable onlyAdmin {
    require(fee_ < 100_00, Errors.VT_FEE_TOO_BIG);

    _fee = fee_;
  }

  /**
   * @dev Set the vault minimum swap loss
   * - Caller is vault Admin
   * @param swapLoss_ - The minimum swap loss percentage value. ex 1% = 100
   */
  function setSwapLoss(uint256 swapLoss_) external payable onlyAdmin {
    require(swapLoss_ < 100_00, Errors.VT_FEE_TOO_BIG);

    _swapLoss = swapLoss_;
  }

  /**
   * @dev Set the vault admin
   * - Caller is Admin
   * @param admin_ - The vault admin address
   */
  function setAdmin(address admin_) external payable {
    require(_addressesProvider.getPoolAdmin() == msg.sender, Errors.CALLER_NOT_POOL_ADMIN);
    require(admin_ != address(0), Errors.VT_INVALID_CONFIGURATION);

    _admin = admin_;
  }

  /**
   * @dev Authorize the leverage/deleverage contract to handle the collateral, debt and staked internal asset.
   * - Caller is vault Admin
   * @param _asset - The collateral external asset or borrowable asset address
   * @param _swapper - The leverage/deleverage contract address
   * @param _isCollateral - If true, `_asset` is the collateral external asset
   */
  function authorizeSwapper(
    address _asset,
    address _swapper,
    bool _isCollateral
  ) external payable onlyAdmin {
    address reserveAsset = _asset;
    if (_isCollateral) {
      reserveAsset = ICollateralAdapter(_addressesProvider.getAddress('COLLATERAL_ADAPTER'))
        .getInternalCollateralAsset(_asset);
    }

    DataTypes.ReserveData memory reserve = ILendingPool(_addressesProvider.getLendingPool())
      .getReserveData(reserveAsset);

    // approve asset
    IERC20(_asset).safeApprove(_swapper, 0);
    if (IERC20(_asset).allowance(address(this), _swapper) == 0) {
      IERC20(_asset).safeApprove(_swapper, type(uint256).max);
    }

    if (_isCollateral) {
      // approve staked asset
      address sAsset = reserve.aTokenAddress;
      IERC20(sAsset).safeApprove(_swapper, 0);
      if (IERC20(sAsset).allowance(address(this), _swapper) == 0) {
        IERC20(sAsset).safeApprove(_swapper, type(uint256).max);
      }
    } else {
      // approve debt asset
      ICreditDelegationToken(reserve.variableDebtTokenAddress).approveDelegation(
        _swapper,
        type(uint256).max
      );
    }
  }

  /**
   * @dev Leverage an `_amount` of collateral asset via `_swapper`.
   * - Caller is vault Admin
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

    emit EnterPostion(_swapper, _borrowAsset, _amount, _leverage);
  }

  /**
   * @dev Deleverage an `_requiredAmount` of collateral asset via `_swapper`.
   * - Caller is vault Admin
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

    emit ExitPostion(_swapper, _borrowAsset, _repayAmount, _requiredAmount);
  }

  /**
   * @dev Migration between collateral assets or underlying asset.
   * - Caller is vault Admin
   * @param _amount - The migration amount of `from` collateral address.
   * @param _paths - The uniswap/balancer/curve swap paths between from asset and to asset
   */
  function migration(
    uint256 _amount,
    IGeneralLevSwap.MultipSwapPath[] calldata _paths
  ) external payable onlyAdmin {
    _migration(_amount, _paths);
  }

  /**
   * @dev Claim Yield and migration to underlying asset and distribute to users by increasing shareIndex
   * - Caller is vault Admin
   * @param _assets - The registered assets to variable yield distributor.
                     Normally these are the staked asset addresss of collateral internal assets
   * @param _amounts - The claiming amounts
   * @param _params - The params to perform the migration between yield asset and underlying asset
   */
  function processYield(
    address[] calldata _assets,
    uint256[] calldata _amounts,
    IStructuredVault.YieldMigrationParams[] calldata _params
  ) external payable onlyAdmin {
    address underlyingAsset = _underlyingAsset;
    uint256 yieldAssetCount = _params.length;
    uint256 underlyingAmountBefore = IERC20(underlyingAsset).balanceOf(address(this));

    require(_assets.length == _amounts.length, Errors.VT_INVALID_CONFIGURATION);
    require(yieldAssetCount != 0, Errors.VT_INVALID_CONFIGURATION);

    // Claim yield assets
    IVariableYieldDistribution yieldDistributor = IVariableYieldDistribution(
      _addressesProvider.getAddress('VR_YIELD_DISTRIBUTOR')
    );
    yieldDistributor.claimRewards(_assets, _amounts, address(this));

    // Migration yield assets to underlying asset
    for (uint256 i; i < yieldAssetCount; ++i) {
      IGeneralLevSwap.MultipSwapPath[] calldata paths = _params[i].paths;
      require(paths[paths.length - 1].swapTo == underlyingAsset, Errors.VT_INVALID_CONFIGURATION);

      _migration(IERC20(_params[i].yieldAsset).balanceOf(address(this)), paths);
    }

    // distribute yield and increase share index
    uint256 oldIndex = _shareIndex;
    uint256 increasedUnderlyingAmount = IERC20(underlyingAsset).balanceOf(address(this)) -
      underlyingAmountBefore;
    uint256 yieldShareRatio = increasedUnderlyingAmount.mulDiv(
      DEFAULT_INDEX,
      totalSupply(),
      Math.Rounding.Down
    );

    // newIndex = oldIndex * (1 + yieldShareRatio)
    uint256 newIndex = oldIndex.mulDiv(
      yieldShareRatio + DEFAULT_INDEX,
      DEFAULT_INDEX,
      Math.Rounding.Down
    );

    _shareIndex = newIndex;

    emit ProcessYield(_assets, oldIndex, newIndex);
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
   * @return The structured vault's admin address
   */
  function getAdmin() external view returns (address) {
    return _admin;
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
    uint256 migrationCollateralAmount = maxRequiredAmountPrice.mulDiv(
      10 ** collateral.decimals,
      collateral.price,
      Math.Rounding.Down
    );

    uint256 currCollateralAmount = IERC20(collateralAsset).balanceOf(address(this));
    if (currCollateralAmount != 0) {
      uint256 currCollateralAmountPrice = currCollateralAmount.mulDiv(
        collateral.price,
        10 ** collateral.decimals,
        Math.Rounding.Down
      );

      unchecked {
        if (maxRequiredAmountPrice <= currCollateralAmountPrice) maxRequiredAmountPrice = 0;
        else maxRequiredAmountPrice -= currCollateralAmountPrice;
      }
    }

    if (maxRequiredAmountPrice != 0) {
      uint256 requiredCollateralAmount = maxRequiredAmountPrice.mulDiv(
        10 ** collateral.decimals,
        collateral.price,
        Math.Rounding.Down
      );
      uint256 repayAmount = _getRepayAmount(collateralAsset, maxRequiredAmountPrice, underlying);

      //exit position
      IGeneralLevSwap(_params.swapper).withdrawWithFlashloan(
        repayAmount,
        requiredCollateralAmount,
        _params.borrowAsset,
        _params.sAsset,
        _params.flashLoanType,
        _params.swapInfo
      );
    }

    // migration call
    uint256 resultAmount = _migration(migrationCollateralAmount, _params.paths);

    require(resultAmount >= _requiredUnderlyingAmount, Errors.VT_SWAP_MISMATCH_RETURNED_AMOUNT);
  }

  function _migration(
    uint256 _amount,
    IGeneralLevSwap.MultipSwapPath[] calldata _paths
  ) internal returns (uint256) {
    uint256 pathLength = _paths.length;
    require(pathLength != 0, Errors.VT_INVALID_CONFIGURATION);
    require(_amount != 0, Errors.VT_INVALID_CONFIGURATION);

    uint256 amount = _amount;
    for (uint256 i; i < pathLength; ++i) {
      if (_paths[i].swapType == IGeneralLevSwap.SwapType.NONE) continue;
      amount = _processSwap(amount, _paths[i]);
    }

    emit Migration(_paths[0].swapFrom, _paths[pathLength - 1].swapTo, _amount, amount);

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
