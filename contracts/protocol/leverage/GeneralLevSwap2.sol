// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IERC20Detailed} from '../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {ReentrancyGuard} from '../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol';
import {IPriceOracleGetter} from '../../interfaces/IPriceOracleGetter.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import {IGeneralVault} from '../../interfaces/IGeneralVault.sol';
import {IGeneralLevSwap2} from '../../interfaces/IGeneralLevSwap2.sol';
import {IAToken} from '../../interfaces/IAToken.sol';
import {IFlashLoanReceiver} from '../../flashloan/interfaces/IFlashLoanReceiver.sol';
import {IFlashLoanRecipient} from '../../flashloan/interfaces/IFlashLoanRecipient.sol';
import {IVaultWhitelist} from '../../interfaces/IVaultWhitelist.sol';
import {IAaveFlashLoan} from '../../interfaces/IAaveFlashLoan.sol';
import {IBalancerVault} from '../../interfaces/IBalancerVault.sol';
import {DataTypes} from '../libraries/types/DataTypes.sol';
import {ReserveConfiguration} from '../libraries/configuration/ReserveConfiguration.sol';
import {Math} from '../../dependencies/openzeppelin/contracts/Math.sol';
import {WadRayMath} from '../libraries/math/WadRayMath.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {BalancerswapAdapter} from '../libraries/swap/BalancerswapAdapter.sol';
import {UniswapAdapter} from '../libraries/swap/UniswapAdapter.sol';
import {CurveswapAdapter} from '../libraries/swap/CurveswapAdapter.sol';

abstract contract GeneralLevSwap2 is IFlashLoanReceiver, IFlashLoanRecipient, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;
  using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
  using WadRayMath for uint256;

  uint256 private constant USE_VARIABLE_DEBT = 2;

  address private constant AAVE_LENDING_POOL_ADDRESS = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;

  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  IVaultWhitelist private constant VAULT_WHITELIST =
    IVaultWhitelist(0x88eE44794bAf865E3b0b192d1F9f0AC3Daf1EA0E);

  address public immutable COLLATERAL; // The address of external asset

  uint256 public immutable DECIMALS; // The collateral decimals

  address public immutable VAULT; // The address of vault

  ILendingPoolAddressesProvider internal immutable PROVIDER;

  IPriceOracleGetter internal immutable ORACLE;

  ILendingPool internal immutable LENDING_POOL;

  mapping(address => bool) internal ENABLED_BORROW_ASSETS;

  //1 == not inExec
  //2 == inExec;
  //setting default to 1 to save some gas.
  uint256 private _balancerFlashLoanLock = 1;

  /**
   * @param _asset The external asset ex. wFTM
   * @param _vault The deployed vault address
   * @param _provider The deployed AddressProvider
   */
  constructor(address _asset, address _vault, address _provider) {
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
   * Get borrow coins available to borrow
   */
  function getAvailableBorrowAssets() external pure virtual returns (address[] memory) {
    return new address[](0);
  }

  function _getAssetPrice(address _asset) internal view returns (uint256) {
    return ORACLE.getAssetPrice(_asset);
  }

  /**
   * This function is called after your contract has received the flash loaned amount
   * overriding executeOperation() in IFlashLoanReceiver
   */
  function executeOperation(
    address[] calldata assets,
    uint256[] calldata amounts,
    uint256[] calldata premiums,
    address initiator,
    bytes calldata params
  ) external override returns (bool) {
    require(initiator == address(this), Errors.LS_INVALID_CONFIGURATION);
    require(msg.sender == AAVE_LENDING_POOL_ADDRESS, Errors.LS_INVALID_CONFIGURATION);
    require(assets.length == amounts.length, Errors.LS_INVALID_CONFIGURATION);
    require(assets.length == premiums.length, Errors.LS_INVALID_CONFIGURATION);
    require(amounts[0] != 0, Errors.LS_INVALID_CONFIGURATION);
    require(assets[0] != address(0), Errors.LS_INVALID_CONFIGURATION);

    _executeOperation(assets[0], amounts[0], premiums[0], params);

    // approve the Aave LendingPool contract allowance to *pull* the owed amount
    IERC20(assets[0]).safeApprove(AAVE_LENDING_POOL_ADDRESS, 0);
    IERC20(assets[0]).safeApprove(AAVE_LENDING_POOL_ADDRESS, amounts[0] + premiums[0]);

    return true;
  }

  /**
   * This function is called after your contract has received the flash loaned amount
   * overriding receiveFlashLoan() in IFlashLoanRecipient
   */
  function receiveFlashLoan(
    IERC20[] memory tokens,
    uint256[] memory amounts,
    uint256[] memory feeAmounts,
    bytes memory userData
  ) external override {
    require(msg.sender == BALANCER_VAULT, Errors.LS_INVALID_CONFIGURATION);
    require(_balancerFlashLoanLock == 2, Errors.LS_INVALID_CONFIGURATION);
    require(tokens.length == amounts.length, Errors.LS_INVALID_CONFIGURATION);
    require(tokens.length == feeAmounts.length, Errors.LS_INVALID_CONFIGURATION);
    require(amounts[0] != 0, Errors.LS_INVALID_CONFIGURATION);
    require(address(tokens[0]) != address(0), Errors.LS_INVALID_CONFIGURATION);
    _balancerFlashLoanLock = 1;

    _executeOperation(address(tokens[0]), amounts[0], feeAmounts[0], userData);

    // send tokens to Balancer vault contract
    IERC20(tokens[0]).safeTransfer(msg.sender, amounts[0] + feeAmounts[0]);
  }

  function _executeOperation(
    address asset,
    uint256 borrowAmount,
    uint256 fee,
    bytes memory params
  ) internal {
    // parse params
    IGeneralLevSwap2.FlashLoanParams memory opsParams = abi.decode(
      params,
      (IGeneralLevSwap2.FlashLoanParams)
    );
    require(opsParams.slippage != 0, Errors.LS_INVALID_CONFIGURATION);
    require(opsParams.minCollateralAmount != 0, Errors.LS_INVALID_CONFIGURATION);
    require(opsParams.user != address(0), Errors.LS_INVALID_CONFIGURATION);

    if (opsParams.isEnterPosition) {
      _enterPositionWithFlashloan(asset, borrowAmount, fee, opsParams);
    } else {
      require(opsParams.sAsset != address(0), Errors.LS_INVALID_CONFIGURATION);
      _withdrawWithFlashloan(asset, borrowAmount, opsParams);
    }
  }

  /**
   * @param _principal - The amount of collateral
   * @param _leverage - Extra leverage value and must be greater than 0, ex. 300% = 300_00
   *                    _principal + _principal * _leverage should be used as collateral
   * @param _slippage - Slippage valule to borrow enough asset by flashloan,
   *                    Must be greater than 0%.
   *                    Borrowing amount = _principal * _leverage * _slippage
   * @param _borrowAsset - The borrowing asset address when leverage works
   * @param _flashLoanType - 0 is Aave, 1 is Balancer
   * @param _swapInfo - The uniswap/balancer swap paths between borrowAsset and collateral
   */
  function enterPositionWithFlashloan(
    uint256 _principal,
    uint256 _leverage,
    uint256 _slippage,
    address _borrowAsset,
    IGeneralLevSwap2.FlashLoanType _flashLoanType,
    IGeneralLevSwap2.SwapInfo calldata _swapInfo
  ) external nonReentrant {
    require(_principal != 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(_leverage != 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(_slippage != 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(_leverage < 900_00, Errors.LS_INVALID_CONFIGURATION);
    require(_borrowAsset != address(0), Errors.LS_INVALID_CONFIGURATION);
    require(ENABLED_BORROW_ASSETS[_borrowAsset], Errors.LS_STABLE_COIN_NOT_SUPPORTED);
    require(IERC20(COLLATERAL).balanceOf(msg.sender) >= _principal, Errors.LS_SUPPLY_NOT_ALLOWED);

    IERC20(COLLATERAL).safeTransferFrom(msg.sender, address(this), _principal);

    _leverageWithFlashloan(
      IGeneralLevSwap2.LeverageParams(
        msg.sender,
        _principal,
        _leverage,
        _slippage,
        _borrowAsset,
        _flashLoanType,
        _swapInfo
      )
    );
  }

  /**
   * @param _repayAmount - The amount of repay
   * @param _requiredAmount - The amount of collateral
   * @param _slippage - The slippage of the every withdrawal amount. 1% = 100
   * @param _borrowAsset - The borrowing asset address when leverage works
   * @param _sAsset - staked asset address of collateral internal asset
   * @param _flashLoanType - 0 is Aave, 1 is Balancer
   * @param _swapInfo - The uniswap/balancer/curve swap infos between borrowAsset and collateral
   */
  function withdrawWithFlashloan(
    uint256 _repayAmount,
    uint256 _requiredAmount,
    uint256 _slippage,
    address _borrowAsset,
    address _sAsset,
    IGeneralLevSwap2.FlashLoanType _flashLoanType,
    IGeneralLevSwap2.SwapInfo calldata _swapInfo
  ) external nonReentrant {
    require(_repayAmount != 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(_requiredAmount != 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(_slippage != 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(_borrowAsset != address(0), Errors.LS_INVALID_CONFIGURATION);
    require(ENABLED_BORROW_ASSETS[_borrowAsset], Errors.LS_STABLE_COIN_NOT_SUPPORTED);
    require(_sAsset != address(0), Errors.LS_INVALID_CONFIGURATION);
    require(
      _sAsset ==
        LENDING_POOL.getReserveData(IAToken(_sAsset).UNDERLYING_ASSET_ADDRESS()).aTokenAddress,
      Errors.LS_INVALID_CONFIGURATION
    );

    uint256 debtAmount = _getDebtAmount(
      LENDING_POOL.getReserveData(_borrowAsset).variableDebtTokenAddress,
      msg.sender
    );

    uint256[] memory amounts = new uint256[](1);
    amounts[0] = Math.min(_repayAmount, debtAmount);

    bytes memory params = abi.encode(
      false /*leavePosition*/,
      _slippage,
      _requiredAmount,
      msg.sender,
      _sAsset,
      _swapInfo
    );

    if (_flashLoanType == IGeneralLevSwap2.FlashLoanType.AAVE) {
      // 0 means revert the transaction if not validated
      uint256[] memory modes = new uint256[](1);
      modes[0] = 0;

      address[] memory assets = new address[](1);
      assets[0] = _borrowAsset;
      IAaveFlashLoan(AAVE_LENDING_POOL_ADDRESS).flashLoan(
        address(this),
        assets,
        amounts,
        modes,
        address(this),
        params,
        0
      );
    } else {
      require(_balancerFlashLoanLock == 1, Errors.LS_INVALID_CONFIGURATION);
      IERC20[] memory assets = new IERC20[](1);
      assets[0] = IERC20(_borrowAsset);
      _balancerFlashLoanLock = 2;
      IBalancerVault(BALANCER_VAULT).flashLoan(address(this), assets, amounts, params);
    }

    // remained borrow asset -> collateral
    _swapTo(
      _borrowAsset,
      IERC20(_borrowAsset).balanceOf(address(this)),
      _slippage,
      _swapInfo.paths,
      _swapInfo.pathLength
    );

    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    if (collateralAmount > _requiredAmount) {
      _supply(collateralAmount - _requiredAmount, msg.sender);
      collateralAmount = _requiredAmount;
    }

    // finally deliver the collateral to user
    IERC20(COLLATERAL).safeTransfer(msg.sender, collateralAmount);
  }

  function _enterPositionWithFlashloan(
    address _borrowAsset,
    uint256 _borrowedAmount,
    uint256 _fee,
    IGeneralLevSwap2.FlashLoanParams memory _params
  ) internal {
    //swap borrow asset to collateral
    _swapTo(
      _borrowAsset,
      _borrowedAmount,
      _params.slippage,
      _params.swapInfo.paths,
      _params.swapInfo.pathLength
    );

    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    require(collateralAmount >= _params.minCollateralAmount, Errors.LS_SUPPLY_FAILED);

    //deposit collateral
    _supply(collateralAmount, _params.user);

    //borrow
    _borrow(_borrowAsset, _borrowedAmount + _fee, _params.user);
  }

  function _withdrawWithFlashloan(
    address _borrowAsset,
    uint256 _borrowedAmount,
    IGeneralLevSwap2.FlashLoanParams memory _params
  ) internal {
    // repay
    _repay(_borrowAsset, _borrowedAmount, _params.user);

    // withdraw collateral
    // get internal asset address
    address internalAsset = IAToken(_params.sAsset).UNDERLYING_ASSET_ADDRESS();
    // get reserve info of internal asset
    DataTypes.ReserveConfigurationMap memory configuration = LENDING_POOL.getConfiguration(
      internalAsset
    );
    (, uint256 assetLiquidationThreshold, , , ) = configuration.getParamsMemory();
    require(assetLiquidationThreshold != 0, Errors.LS_INVALID_CONFIGURATION);
    // get user info
    (
      uint256 totalCollateralETH,
      uint256 totalDebtETH,
      ,
      uint256 currentLiquidationThreshold,
      ,

    ) = LENDING_POOL.getUserAccountData(_params.user);

    uint256 withdrawalAmountETH = (((totalCollateralETH * currentLiquidationThreshold) /
      PercentageMath.PERCENTAGE_FACTOR -
      totalDebtETH) * PercentageMath.PERCENTAGE_FACTOR) / assetLiquidationThreshold;

    uint256 withdrawalAmount = Math.min(
      IERC20(_params.sAsset).balanceOf(_params.user),
      (withdrawalAmountETH * (10 ** DECIMALS)) / _getAssetPrice(COLLATERAL)
    );

    require(withdrawalAmount >= _params.minCollateralAmount, Errors.LS_SUPPLY_NOT_ALLOWED);

    IERC20(_params.sAsset).safeTransferFrom(_params.user, address(this), withdrawalAmount);
    _remove(withdrawalAmount, _params.slippage, _params.user);

    // collateral -> borrow asset
    _swapFrom(
      _borrowAsset,
      _params.slippage,
      _params.swapInfo.reversePaths,
      _params.swapInfo.pathLength
    );
  }

  function _supply(uint256 _amount, address _user) internal {
    // whitelist checking
    if (VAULT_WHITELIST.whitelistUserCount(VAULT) != 0) {
      require(VAULT_WHITELIST.whitelistUser(VAULT, _user), Errors.CALLER_NOT_WHITELIST_USER);
    }

    IERC20(COLLATERAL).safeApprove(VAULT, 0);
    IERC20(COLLATERAL).safeApprove(VAULT, _amount);
    IGeneralVault(VAULT).depositCollateralFrom(COLLATERAL, _amount, _user);
  }

  function _remove(uint256 _amount, uint256 _slippage, address _user) internal {
    // whitelist checking
    if (VAULT_WHITELIST.whitelistUserCount(VAULT) != 0) {
      require(VAULT_WHITELIST.whitelistUser(VAULT, _user), Errors.CALLER_NOT_WHITELIST_USER);
    }

    IGeneralVault(VAULT).withdrawCollateral(COLLATERAL, _amount, _slippage, address(this));
  }

  function _getDebtAmount(
    address _variableDebtTokenAddress,
    address _user
  ) internal view returns (uint256) {
    return IERC20(_variableDebtTokenAddress).balanceOf(_user);
  }

  function _borrow(address _borrowAsset, uint256 _amount, address borrower) internal {
    LENDING_POOL.borrow(_borrowAsset, _amount, USE_VARIABLE_DEBT, 0, borrower);
  }

  function _repay(address _borrowAsset, uint256 _amount, address borrower) internal {
    IERC20(_borrowAsset).safeApprove(address(LENDING_POOL), 0);
    IERC20(_borrowAsset).safeApprove(address(LENDING_POOL), _amount);

    uint256 paybackAmount = LENDING_POOL.repay(_borrowAsset, _amount, USE_VARIABLE_DEBT, borrower);
    require(paybackAmount != 0, Errors.LS_REPAY_FAILED);
  }

  /**
   * @param _zappingAsset - The stable coin address which will zap into lp token
   * @param _principal - The amount of collateral
   * @param _slippage - Slippage value to zap deposit, Must be greater than 0%.
   * @param _swapInfo - The uniswap/balancer/curve swap paths
   */
  function zapDeposit(
    address _zappingAsset,
    uint256 _principal,
    uint256 _slippage,
    IGeneralLevSwap2.SwapInfo calldata _swapInfo
  ) external nonReentrant {
    require(_principal != 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(_zappingAsset != address(0), Errors.LS_INVALID_CONFIGURATION);
    require(ENABLED_BORROW_ASSETS[_zappingAsset], Errors.LS_STABLE_COIN_NOT_SUPPORTED);
    require(
      IERC20(_zappingAsset).balanceOf(msg.sender) >= _principal,
      Errors.LS_SUPPLY_NOT_ALLOWED
    );

    IERC20(_zappingAsset).safeTransferFrom(msg.sender, address(this), _principal);

    uint256 suppliedAmount = _swapTo(
      _zappingAsset,
      _principal,
      _slippage,
      _swapInfo.paths,
      _swapInfo.pathLength
    );
    // supply to LP
    _supply(suppliedAmount, msg.sender);
  }

  /**
   * @param _zappingAsset - The stable coin address which will zap into lp token
   * @param _principal - The amount of the stable coin
   * @param _leverage - Extra leverage value and must be greater than 0, ex. 300% = 300_00
   *                    principal + principal * leverage should be used as collateral
   * @param _slippage - Slippage valule to borrow enough asset by flashloan,
   *                    Must be greater than 0%.
   *                    Borrowing amount = principal * leverage * slippage
   * @param _borrowAsset - The borrowing asset address when leverage works
   * @param _flashLoanType - 0 is Aave, 1 is Balancer
   * @param _zapPaths - The uniswap/balancer/curve swap paths between zappingAsset and collateral
   * @param _zapPathLength - The uniswap/balancer/curve swap path length between zappingAsset and collateral
   * @param _swapInfo - The uniswap/balancer/curve swap between borrowAsset and collateral
   */
  function zapLeverageWithFlashloan(
    address _zappingAsset,
    uint256 _principal,
    uint256 _leverage,
    uint256 _slippage,
    address _borrowAsset,
    IGeneralLevSwap2.FlashLoanType _flashLoanType,
    IGeneralLevSwap2.MultipSwapPath[3] calldata _zapPaths,
    uint256 _zapPathLength,
    IGeneralLevSwap2.SwapInfo calldata _swapInfo
  ) external nonReentrant {
    require(_principal != 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(_leverage != 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(_slippage != 0, Errors.LS_SWAP_AMOUNT_NOT_GT_0);
    require(_leverage < 900_00, Errors.LS_INVALID_CONFIGURATION);
    require(_borrowAsset != address(0), Errors.LS_INVALID_CONFIGURATION);
    require(_zappingAsset != address(0), Errors.LS_INVALID_CONFIGURATION);
    require(ENABLED_BORROW_ASSETS[_zappingAsset], Errors.LS_STABLE_COIN_NOT_SUPPORTED);
    require(ENABLED_BORROW_ASSETS[_borrowAsset], Errors.LS_STABLE_COIN_NOT_SUPPORTED);
    require(
      IERC20(_zappingAsset).balanceOf(msg.sender) >= _principal,
      Errors.LS_SUPPLY_NOT_ALLOWED
    );

    IERC20(_zappingAsset).safeTransferFrom(msg.sender, address(this), _principal);

    uint256 collateralAmount = _swapTo(
      _zappingAsset,
      _principal,
      _slippage,
      _zapPaths,
      _zapPathLength
    );

    _leverageWithFlashloan(
      IGeneralLevSwap2.LeverageParams(
        msg.sender,
        collateralAmount,
        _leverage,
        _slippage,
        _borrowAsset,
        _flashLoanType,
        _swapInfo
      )
    );
  }

  function _leverageWithFlashloan(IGeneralLevSwap2.LeverageParams memory _params) internal {
    uint256 minCollateralAmount = _params.principal.percentMul(
      PercentageMath.PERCENTAGE_FACTOR + _params.leverage
    );

    bytes memory params = abi.encode(
      true /*enterPosition*/,
      _params.slippage,
      minCollateralAmount,
      _params.user,
      address(0),
      _params.swapInfo
    );

    uint256 borrowAssetDecimals = IERC20Detailed(_params.borrowAsset).decimals();
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = ((((_params.principal * _getAssetPrice(COLLATERAL)) / 10 ** DECIMALS) *
      10 ** borrowAssetDecimals) / _getAssetPrice(_params.borrowAsset))
      .percentMul(_params.leverage)
      .percentMul(PercentageMath.PERCENTAGE_FACTOR + _params.slippage);

    if (_params.flashLoanType == IGeneralLevSwap2.FlashLoanType.AAVE) {
      // 0 means revert the transaction if not validated
      uint256[] memory modes = new uint256[](1);
      address[] memory assets = new address[](1);
      assets[0] = _params.borrowAsset;
      IAaveFlashLoan(AAVE_LENDING_POOL_ADDRESS).flashLoan(
        address(this),
        assets,
        amounts,
        modes,
        address(this),
        params,
        0
      );
    } else {
      require(_balancerFlashLoanLock == 1, Errors.LS_INVALID_CONFIGURATION);

      IERC20[] memory assets = new IERC20[](1);
      assets[0] = IERC20(_params.borrowAsset);
      _balancerFlashLoanLock = 2;
      IBalancerVault(BALANCER_VAULT).flashLoan(address(this), assets, amounts, params);
      _balancerFlashLoanLock = 1;
    }
  }

  function _getMinAmount(
    address _assetToSwapFrom,
    address _assetToSwapTo,
    uint256 _amountToSwap,
    uint256 _slippage
  ) internal view returns (uint256) {
    uint256 fromAssetDecimals = IERC20Detailed(_assetToSwapFrom).decimals();
    uint256 toAssetDecimals = IERC20Detailed(_assetToSwapTo).decimals();

    uint256 fromAssetPrice = _getAssetPrice(_assetToSwapFrom);
    uint256 toAssetPrice = _getAssetPrice(_assetToSwapTo);

    return
      ((_amountToSwap * fromAssetPrice * 10 ** toAssetDecimals) /
        (toAssetPrice * 10 ** fromAssetDecimals)).percentMul(
          PercentageMath.PERCENTAGE_FACTOR - _slippage
        );
  }

  function _swapTo(
    address _borrowingAsset,
    uint256 _amount,
    uint256 _slippage,
    IGeneralLevSwap2.MultipSwapPath[3] memory _paths,
    uint256 _pathLength
  ) internal returns (uint256) {
    require(_pathLength > 0, Errors.LS_INVALID_CONFIGURATION);
    require(_paths[0].swapFrom == _borrowingAsset, Errors.LS_INVALID_CONFIGURATION);
    require(_paths[_pathLength - 1].swapTo == COLLATERAL, Errors.LS_INVALID_CONFIGURATION);

    uint256 amount = _amount;
    for (uint256 i; i < _pathLength; ++i) {
      if (_paths[i].swapType == IGeneralLevSwap2.SwapType.NONE) continue;

      amount = _processSwap(amount, _slippage, _paths[i], false);
    }

    return amount;
  }

  function _swapFrom(
    address _borrowingAsset,
    uint256 _slippage,
    IGeneralLevSwap2.MultipSwapPath[3] memory _paths,
    uint256 _pathLength
  ) internal returns (uint256) {
    require(_pathLength > 0, Errors.LS_INVALID_CONFIGURATION);
    require(_paths[0].swapFrom == COLLATERAL, Errors.LS_INVALID_CONFIGURATION);
    require(_paths[_pathLength - 1].swapTo == _borrowingAsset, Errors.LS_INVALID_CONFIGURATION);

    uint256 amount = IERC20(COLLATERAL).balanceOf(address(this));
    for (uint256 i; i < _pathLength; ++i) {
      if (_paths[i].swapType == IGeneralLevSwap2.SwapType.NONE) continue;

      amount = _processSwap(amount, _slippage, _paths[i], true);
    }

    return amount;
  }

  function _swapByPath(
    uint256 _fromAmount,
    uint256 _slippage,
    IGeneralLevSwap2.MultipSwapPath memory _path
  ) internal returns (uint256) {
    uint256 poolCount = _path.poolCount;
    require(poolCount > 0, Errors.LS_INVALID_CONFIGURATION);

    if (_path.swapType == IGeneralLevSwap2.SwapType.BALANCER) {
      // Balancer Swap
      BalancerswapAdapter.Path memory path;
      path.tokens = new address[](poolCount + 1);
      path.poolIds = new bytes32[](poolCount);

      for (uint256 i; i < poolCount; ++i) {
        path.tokens[i] = _path.routes[i * 2];
        path.poolIds[i] = bytes32(_path.routeParams[i][0]);
      }
      path.tokens[poolCount] = _path.routes[poolCount * 2];

      return
        BalancerswapAdapter.swapExactTokensForTokens(
          PROVIDER,
          _path.swapFrom,
          _path.swapTo,
          _fromAmount,
          path,
          _slippage
        );
    }

    if (_path.swapType == IGeneralLevSwap2.SwapType.UNISWAP) {
      // UniSwap
      UniswapAdapter.Path memory path;
      path.tokens = new address[](poolCount + 1);
      path.fees = new uint256[](poolCount);

      for (uint256 i; i < poolCount; ++i) {
        path.tokens[i] = _path.routes[i * 2];
        path.fees[i] = _path.routeParams[i][0];
      }
      path.tokens[poolCount] = _path.routes[poolCount * 2];

      return
        UniswapAdapter.swapExactTokensForTokens(
          PROVIDER,
          _path.swapFrom,
          _path.swapTo,
          _fromAmount,
          path,
          _slippage
        );
    }

    // Curve Swap
    return
      CurveswapAdapter.swapExactTokensForTokens(
        PROVIDER,
        _path.swapFrom,
        _path.swapTo,
        _fromAmount,
        CurveswapAdapter.Path(_path.routes, _path.routeParams),
        _slippage
      );
  }

  function _processSwap(
    uint256,
    uint256,
    IGeneralLevSwap2.MultipSwapPath memory,
    bool
  ) internal virtual returns (uint256);
}
