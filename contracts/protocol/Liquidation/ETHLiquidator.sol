// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {IFlashLoanReceiver} from '../../flashloan/interfaces/IFlashLoanReceiver.sol';
import {IFlashLoanRecipient} from '../../flashloan/interfaces/IFlashLoanRecipient.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {IAaveFlashLoan} from '../../interfaces/IAaveFlashLoan.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {IWETH} from '../../misc/interfaces/IWETH.sol';
import {IBalancerVault} from '../../interfaces/IBalancerVault.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {CurveswapAdapter} from '../libraries/swap/CurveswapAdapter.sol';
import {UniswapAdapter} from '../libraries/swap/UniswapAdapter.sol';

/**
 * @title ETHLiquidator
 * @notice ETHLiquidator
 * @author Sturdy
 **/

interface ICurvePool {
  function coins(uint256) external view returns (address);

  function coins(int128) external view returns (address);

  function calc_withdraw_one_coin(uint256 _burn_amount, int128 i) external view returns (uint256);

  function calc_withdraw_one_coin(
    uint256 _burn_amount,
    int128 i,
    bool _use_underlying
  ) external view returns (uint256);

  function remove_liquidity_one_coin(
    uint256 _burn_amount,
    int128 i,
    uint256 _min_received,
    address _receiver
  ) external returns (uint256);

  function remove_liquidity_one_coin(
    uint256 _burn_amount,
    int128 i,
    uint256 _min_received
  ) external;

  function remove_liquidity_one_coin(
    uint256 _burn_amount,
    int128 i,
    uint256 _min_received,
    bool _use_underlying
  ) external returns (uint256);

  function remove_liquidity_imbalance(
    uint256[4] calldata amounts,
    uint256 max_burn_amount
  ) external;

  function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256);

  function get_virtual_price() external view returns (uint256 price);
}

interface IBaseCurvePool {
  function remove_liquidity_one_coin(
    uint256 _burn_amount,
    int128 i,
    uint256 _min_received
  ) external returns (uint256);
}

interface CYAsset {
  function redeem(uint256 redeemTokens) external returns (uint256);
}

contract ETHLiquidator is IFlashLoanReceiver, IFlashLoanRecipient, Ownable {
  using SafeERC20 for IERC20;

  struct SwapPath {
    UniswapAdapter.Path u_path;
  }

  enum FlashLoanType {
    AAVE,
    BALANCER
  }

  address private constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address private constant AAVE_LENDING_POOL_ADDRESS = 0x7937D4799803FbBe595ed57278Bc4cA21f3bFfCB;
  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
  address private constant FRAX_3CRV_LP_ADDRESS = 0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B;
  address private constant DAI_USDC_USDT_SUSD_LP_ADDRESS =
    0xC25a3A3b969415c80451098fa907EC722572917F;
  address private constant DAI_USDC_USDT_SUSD_POOL_ADDRESS =
    0xA5407eAE9Ba41422680e2e00537571bcC53efBfD;
  address private constant FRAX_USDC_LP_ADDRESS = 0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC;
  address private constant FRAX_USDC_POOL_ADDRESS = 0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2;
  address private constant POOL_3CRV_ADDRESS = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;
  address private constant TUSD_FRAXBP_LP_ADDRESS = 0x33baeDa08b8afACc4d3d07cf31d49FC1F1f3E893;
  address private constant STETH_ETH_POOL_ADDRESS = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022;

  address private constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address private constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
  address private constant FRAX = 0x853d955aCEf822Db058eb8505911ED77F175b99e;
  address private constant TUSD = 0x0000000000085d4780B73119b644AE5ecd22b376;
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  address private constant STETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

  ILendingPoolAddressesProvider private immutable PROVIDER;
  address private immutable LENDING_POOL;

  //1 == not inExec
  //2 == inExec;
  //setting default to 1 to save some gas.
  uint256 private _balancerFlashLoanLock = 1;

  /**
   * @dev Receive ETH
   */
  receive() external payable {}

  /**
   * @dev Function is invoked by the proxy contract when the Adapter contract is deployed.
   * @param _provider The address of the provider
   **/
  constructor(ILendingPoolAddressesProvider _provider) {
    PROVIDER = _provider;
    LENDING_POOL = _provider.getLendingPool();
  }

  function withdraw(address asset) external payable onlyOwner {
    uint256 amount = IERC20(asset).balanceOf(address(this));
    IERC20(asset).safeTransfer(msg.sender, amount);
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

    _executeOperation(assets[0], amounts[0], premiums[0], params);

    // Approve the LendingPool contract allowance to *pull* the owed amount
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
    uint256 prevAssetAmount = IERC20(asset).balanceOf(address(this));

    // call liquidation
    IERC20(asset).safeApprove(LENDING_POOL, 0);
    IERC20(asset).safeApprove(LENDING_POOL, borrowAmount);

    (address collateralAddress, address borrowerAddress, , ) = abi.decode(
      params,
      (address, address, uint256, SwapPath)
    );
    ILendingPool(LENDING_POOL).liquidationCall(
      collateralAddress,
      asset,
      borrowerAddress,
      borrowAmount,
      false
    );

    _processCollateral(prevAssetAmount + fee, asset, params);
  }

  function liquidation(
    address debtAsset,
    uint256 debtToCover,
    FlashLoanType _flashLoanType,
    bytes calldata params
  ) external {
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = debtToCover;

    if (_flashLoanType == FlashLoanType.AAVE) {
      address[] memory assets = new address[](1);
      assets[0] = debtAsset;

      // 0 means revert the transaction if not validated
      uint256[] memory modes = new uint256[](1);
      modes[0] = 0;

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
      assets[0] = IERC20(debtAsset);
      _balancerFlashLoanLock = 2;
      IBalancerVault(BALANCER_VAULT).flashLoan(address(this), assets, amounts, params);
    }
  }

  function _processCollateral(
    uint256 prevAssetAmount,
    address debtAsset,
    bytes memory params
  ) internal {
    uint256 requiredAssetAmount = prevAssetAmount - IERC20(debtAsset).balanceOf(address(this));
    _convertCollateral(params, debtAsset, requiredAssetAmount);
  }

  /**
   * Swap from collateralAsset to debtAsset
   */
  function _convertCollateral(bytes memory params, address asset, uint256 minAssetAmount) internal {
    (address collateralAsset, , uint256 slippage, SwapPath memory path) = abi.decode(
      params,
      (address, address, uint256, SwapPath)
    );
    uint256 collateralAmount = IERC20(collateralAsset).balanceOf(address(this));

    if (collateralAsset == STETH) {
      _convertLIDO(asset, collateralAmount, slippage);
    } else if (collateralAsset == FRAX_3CRV_LP_ADDRESS) {
      _convertFRAX_3CRV(asset, collateralAmount);
    } else if (collateralAsset == DAI_USDC_USDT_SUSD_LP_ADDRESS) {
      _convertDAI_USDC_USDT_SUSD(asset, collateralAmount, minAssetAmount);
    } else if (collateralAsset == FRAX_USDC_LP_ADDRESS) {
      _convertFRAX_USDC(asset, collateralAmount, slippage, path);
    } else if (collateralAsset == TUSD_FRAXBP_LP_ADDRESS) {
      _convertTUSD_FRAXBP(asset, collateralAmount, slippage, path);
    }
  }

  function _convertLIDO(
    address asset,
    uint256 collateralAmount,
    uint256 slippage // Max 0.5%
  ) internal {
    // Exchange stETH -> ETH via Curve
    uint256 receivedETHAmount = CurveswapAdapter.swapExactTokensForTokens(
      PROVIDER,
      STETH_ETH_POOL_ADDRESS,
      STETH,
      ETH,
      collateralAmount,
      slippage
    );

    // ETH -> WETH
    IWETH(WETH).deposit{value: receivedETHAmount}();

    // WETH -> asset
    UniswapAdapter.Path memory path;
    path.tokens = new address[](2);
    path.tokens[0] = WETH;
    path.tokens[1] = asset;

    path.fees = new uint256[](1);
    path.fees[0] = 500; //0.05% pool

    UniswapAdapter.swapExactTokensForTokens(
      PROVIDER,
      WETH,
      asset,
      receivedETHAmount,
      path,
      slippage
    );
  }

  function _convertFRAX_3CRV(address _asset, uint256 _collateralAmount) internal {
    // Withdraw a single asset(3CRV) from the pool
    uint256 minAmount = ICurvePool(FRAX_3CRV_LP_ADDRESS).calc_withdraw_one_coin(
      _collateralAmount,
      1
    );
    uint256 amount = ICurvePool(FRAX_3CRV_LP_ADDRESS).remove_liquidity_one_coin(
      _collateralAmount,
      1,
      minAmount,
      address(this)
    );

    // Swap 3CRV to asset
    _swap3CRV(_asset, amount);
  }

  function _swap3CRV(address _assetOut, uint256 _amount) internal {
    int256 _coin_index = 3;
    for (int256 i; i < 3; ++i) {
      if (ICurvePool(POOL_3CRV_ADDRESS).coins(uint256(i)) == _assetOut) {
        _coin_index = i;
        break;
      }
    }

    require(_coin_index < 3, Errors.LP_LIQUIDATION_CONVERT_FAILED);

    uint256 minAmount = ICurvePool(POOL_3CRV_ADDRESS).calc_withdraw_one_coin(
      _amount,
      int128(_coin_index)
    );

    ICurvePool(POOL_3CRV_ADDRESS).remove_liquidity_one_coin(
      _amount,
      int128(_coin_index),
      minAmount
    );
  }

  function _convertDAI_USDC_USDT_SUSD(
    address _asset,
    uint256 _collateralAmount,
    uint256 _minAssetAmount
  ) internal {
    // Find the coin index of asset
    uint256[4] memory amounts;
    for (uint256 i; i < 4; ++i) {
      if (ICurvePool(DAI_USDC_USDT_SUSD_POOL_ADDRESS).coins(int128(int256(i))) == _asset) {
        amounts[i] = _minAssetAmount;
        break;
      }
    }

    // Withdraw a single asset from the pool
    ICurvePool(DAI_USDC_USDT_SUSD_POOL_ADDRESS).remove_liquidity_imbalance(
      amounts,
      _collateralAmount
    );
  }

  function _convertFRAX_USDC(
    address _asset,
    uint256 _collateralAmount,
    uint256 _slippage,
    SwapPath memory _path
  ) internal {
    // Withdraw a USDC from the pool
    uint256 minAmount = ICurvePool(FRAX_USDC_POOL_ADDRESS).calc_withdraw_one_coin(
      _collateralAmount,
      0
    );
    uint256 amount = IBaseCurvePool(FRAX_USDC_POOL_ADDRESS).remove_liquidity_one_coin(
      _collateralAmount,
      0,
      minAmount
    );

    // Swap USDC to asset
    if (_asset != USDC) {
      UniswapAdapter.swapExactTokensForTokens(
        PROVIDER,
        FRAX,
        _asset,
        amount,
        _path.u_path,
        _slippage
      );
    }
  }

  function _convertTUSD_FRAXBP(
    address _asset,
    uint256 _collateralAmount,
    uint256 _slippage,
    SwapPath memory _path
  ) internal {
    int256 coinIndex;

    if (_asset == USDC) {
      coinIndex = 1;
    }

    // Collateral -> FRAXBP or TUSD
    uint256 minAmount = ICurvePool(TUSD_FRAXBP_LP_ADDRESS).calc_withdraw_one_coin(
      _collateralAmount,
      int128(coinIndex)
    );
    uint256 amountOut = IBaseCurvePool(TUSD_FRAXBP_LP_ADDRESS).remove_liquidity_one_coin(
      _collateralAmount,
      int128(coinIndex),
      minAmount
    );

    if (_asset == USDC) {
      // FRAXBP -> USDC
      minAmount = ICurvePool(FRAX_USDC_POOL_ADDRESS).calc_withdraw_one_coin(
        amountOut,
        int128(coinIndex)
      );
      IBaseCurvePool(FRAX_USDC_POOL_ADDRESS).remove_liquidity_one_coin(
        amountOut,
        int128(coinIndex),
        minAmount
      );
      return;
    }

    // TUSD -> asset
    UniswapAdapter.swapExactTokensForTokens(
      PROVIDER,
      TUSD,
      _asset,
      amountOut,
      _path.u_path,
      _slippage
    );
  }
}
