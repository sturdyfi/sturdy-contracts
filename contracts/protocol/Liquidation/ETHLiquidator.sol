// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {IFlashLoanReceiver} from '../../flashloan/interfaces/IFlashLoanReceiver.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {IAaveFlashLoan} from '../../interfaces/IAaveFlashLoan.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {IWETH} from '../../misc/interfaces/IWETH.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {CurveswapAdapter} from '../libraries/swap/CurveswapAdapter.sol';
import {UniswapAdapter} from '../libraries/swap/UniswapAdapter.sol';
import {IChainlinkAggregator} from '../../interfaces/IChainlinkAggregator.sol';
import {Math} from '../../dependencies/openzeppelin/contracts/Math.sol';

/**
 * @title ETHLiquidator
 * @notice ETHLiquidator
 * @author Sturdy
 **/

interface ICurvePool {
  function coins(uint256) external view returns (address);

  function coins(int128) external view returns (address);

  function calc_withdraw_one_coin(uint256 _burn_amount, int128 i) external view returns (uint256);

  function remove_liquidity_one_coin(
    uint256 _burn_amount,
    int128 i,
    uint256 _min_received
  ) external returns (uint256);

  function remove_liquidity_imbalance(uint256[4] calldata amounts, uint256 max_burn_amount)
    external;

  function exchange(
    int128 i,
    int128 j,
    uint256 dx,
    uint256 min_dy
  ) external returns (uint256);

  function get_virtual_price() external view returns (uint256 price);
}

interface CYAsset {
  function redeem(uint256 redeemTokens) external returns (uint256);
}

contract ETHLiquidator is IFlashLoanReceiver, Ownable {
  using SafeERC20 for IERC20;

  address private constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address private constant AAVE_LENDING_POOL_ADDRESS = 0x7937D4799803FbBe595ed57278Bc4cA21f3bFfCB;
  address private constant FRAX_3CRV_LP_ADDRESS = 0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B;
  address private constant MIM_3CRV_LP_ADDRESS = 0x5a6A4D54456819380173272A5E8E9B9904BdF41B;
  address private constant DAI_USDC_USDT_SUSD_LP_ADDRESS =
    0xC25a3A3b969415c80451098fa907EC722572917F;
  address private constant DAI_USDC_USDT_SUSD_POOL_ADDRESS =
    0xA5407eAE9Ba41422680e2e00537571bcC53efBfD;
  address private constant IRON_BANK_LP_ADDRESS = 0x5282a4eF67D9C33135340fB3289cc1711c13638C;
  address private constant IRON_BANK_POOL_ADDRESS = 0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF;
  address private constant FRAX_USDC_LP_ADDRESS = 0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC;
  address private constant FRAX_USDC_POOL_ADDRESS = 0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2;
  address private constant POOL_3CRV_ADDRESS = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;

  address private constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address private constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
  address private constant FRAX = 0x853d955aCEf822Db058eb8505911ED77F175b99e;
  address private constant CYDAI = 0x8e595470Ed749b85C6F7669de83EAe304C2ec68F;
  address private constant CYUSDC = 0x76Eb2FE28b36B3ee97F3Adae0C69606eeDB2A37c;
  address private constant CYUSDT = 0x48759F220ED983dB51fA7A8C0D2AAb8f3ce4166a;

  ILendingPoolAddressesProvider internal _addressesProvider;

  /**
   * @dev Receive ETH
   */
  receive() external payable {}

  /**
   * @dev Function is invoked by the proxy contract when the Adapter contract is deployed.
   * @param _provider The address of the provider
   **/
  constructor(ILendingPoolAddressesProvider _provider) {
    _addressesProvider = _provider;
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
    address,
    bytes calldata params
  ) external override returns (bool) {
    // parse params
    (address collateralAddress, address borrowerAddress) = abi.decode(params, (address, address));
    address lendingPool = _addressesProvider.getLendingPool();

    // call liquidation
    IERC20(assets[0]).safeApprove(lendingPool, 0);
    IERC20(assets[0]).safeApprove(lendingPool, amounts[0]);
    ILendingPool(lendingPool).liquidationCall(
      collateralAddress,
      assets[0],
      borrowerAddress,
      amounts[0],
      false
    );

    _convertCollateral(collateralAddress, assets[0], amounts[0] + premiums[0]);

    // Approve the LendingPool contract allowance to *pull* the owed amount
    IERC20(assets[0]).safeApprove(AAVE_LENDING_POOL_ADDRESS, 0);
    IERC20(assets[0]).safeApprove(AAVE_LENDING_POOL_ADDRESS, amounts[0] + premiums[0]);

    return true;
  }

  function liquidation(
    address debtAsset,
    uint256 debtToCover,
    bytes calldata params
  ) external {
    IAaveFlashLoan AAVE_LENDING_POOL = IAaveFlashLoan(AAVE_LENDING_POOL_ADDRESS);

    address[] memory assets = new address[](1);
    assets[0] = debtAsset;

    uint256[] memory amounts = new uint256[](1);
    amounts[0] = debtToCover;

    // 0 means revert the transaction if not validated
    uint256[] memory modes = new uint256[](1);
    modes[0] = 0;

    AAVE_LENDING_POOL.flashLoan(address(this), assets, amounts, modes, address(this), params, 0);
  }

  /**
   * Swap from collateralAsset to debtAsset
   */
  function _convertCollateral(
    address collateralAsset,
    address asset,
    uint256 minAssetAmount
  ) internal {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    uint256 collateralAmount = IERC20(collateralAsset).balanceOf(address(this));

    if (collateralAsset == provider.getAddress('LIDO')) {
      _convertLIDO(provider, asset, collateralAmount);
    } else if (collateralAsset == FRAX_3CRV_LP_ADDRESS) {
      _convertFRAX_3CRV(asset, collateralAmount);
    } else if (collateralAsset == MIM_3CRV_LP_ADDRESS) {
      _convertMIM_3CRV(asset, collateralAmount);
    } else if (collateralAsset == DAI_USDC_USDT_SUSD_LP_ADDRESS) {
      _convertDAI_USDC_USDT_SUSD(asset, collateralAmount, minAssetAmount);
    } else if (collateralAsset == IRON_BANK_LP_ADDRESS) {
      _convertIRON_BANK(asset, collateralAmount);
    } else if (collateralAsset == FRAX_USDC_LP_ADDRESS) {
      _convertFRAX_USDC(asset, collateralAmount);
    }
  }

  function _convertLIDO(
    ILendingPoolAddressesProvider provider,
    address asset,
    uint256 collateralAmount
  ) internal {
    // Exchange stETH -> ETH via Curve
    uint256 receivedETHAmount = CurveswapAdapter.swapExactTokensForTokens(
      provider,
      provider.getAddress('STETH_ETH_POOL'),
      provider.getAddress('LIDO'),
      ETH,
      collateralAmount,
      500 //0.05%
    );

    // ETH -> WETH
    address weth = provider.getAddress('WETH');
    IWETH(weth).deposit{value: receivedETHAmount}();

    // WETH -> asset
    UniswapAdapter.Path memory path;
    path.tokens = new address[](2);
    path.tokens[0] = weth;
    path.tokens[1] = asset;

    path.fees = new uint256[](1);
    path.fees[0] = 500;

    UniswapAdapter.swapExactTokensForTokens(provider, weth, asset, receivedETHAmount, path, 500);
  }

  function _convertFRAX_3CRV(address _asset, uint256 _collateralAmount) internal {
    // Withdraw a single asset(3CRV) from the pool
    uint256 amount = _withdrawFromCurvePool(_collateralAmount, FRAX_3CRV_LP_ADDRESS, 1);

    // Swap 3CRV to asset
    _swap3CRV(_asset, amount);
  }

  function _withdrawFromCurvePool(
    uint256 _amount,
    address _poolAddress,
    int128 _underlying_coin_index
  ) internal returns (uint256 amount) {
    uint256 minAmount = ICurvePool(_poolAddress).calc_withdraw_one_coin(
      _amount,
      _underlying_coin_index
    );
    amount = ICurvePool(_poolAddress).remove_liquidity_one_coin(
      _amount,
      _underlying_coin_index,
      minAmount
    );
  }

  function _swap3CRV(address _assetOut, uint256 _amount) internal {
    require(POOL_3CRV_ADDRESS != address(0), Errors.LP_LIQUIDATION_CONVERT_FAILED);

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

  function _convertMIM_3CRV(address _asset, uint256 _collateralAmount) internal {
    // Withdraw a single asset(3CRV) from the pool
    uint256 amount = _withdrawFromCurvePool(_collateralAmount, MIM_3CRV_LP_ADDRESS, 1);

    // Swap 3CRV to asset
    _swap3CRV(_asset, amount);
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

  function _convertIRON_BANK(address _asset, uint256 _collateralAmount) internal {
    int128 _coin_index = 3;
    address _cyAsset;

    // Find coin index from asset
    if (_asset == DAI) {
      _coin_index = 0;
      _cyAsset = CYDAI;
    } else if (_asset == USDC) {
      _coin_index = 1;
      _cyAsset = CYUSDC;
    } else if (_asset == USDT) {
      _coin_index = 2;
      _cyAsset = CYUSDT;
    }

    require(_coin_index < 3, Errors.LP_LIQUIDATION_CONVERT_FAILED);

    // Withdraw a single cyAsset from the pool
    uint256 amount = _withdrawFromCurvePool(_collateralAmount, IRON_BANK_POOL_ADDRESS, _coin_index);

    // Swap cyAsset to asset
    CYAsset(_cyAsset).redeem(amount);
  }

  function _convertFRAX_USDC(address _asset, uint256 _collateralAmount) internal {
    int128 _coin_index;

    //Find coin index from asset
    if (_asset == USDC) {
      _coin_index = 1;
    }

    // Withdraw a USDC or FRAX from the pool
    uint256 amount = _withdrawFromCurvePool(_collateralAmount, FRAX_USDC_POOL_ADDRESS, _coin_index);

    // Swap FRAX to asset
    if (_coin_index == 0) {
      UniswapAdapter.Path memory path;
      path.tokens = new address[](2);
      path.tokens[0] = FRAX;
      path.tokens[1] = _asset;

      path.fees = new uint256[](1);
      path.fees[0] = 500; //0.05%

      UniswapAdapter.swapExactTokensForTokens(_addressesProvider, FRAX, _asset, amount, path, 500);
    }
  }
}
