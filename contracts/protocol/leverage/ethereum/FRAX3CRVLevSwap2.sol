// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {GeneralLevSwap2} from '../GeneralLevSwap2.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IGeneralLevSwap2} from '../../../interfaces/IGeneralLevSwap2.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';

interface ICurvePool {
  function calc_withdraw_one_coin(uint256 _burn_amount, int128 i) external view returns (uint256);

  function add_liquidity(uint256[2] memory amounts, uint256 _min_mint_amount) external;

  function remove_liquidity_one_coin(
    uint256 _burn_amount,
    int128 i,
    uint256 _min_received,
    address _receiver
  ) external returns (uint256);

  function balances(uint256 _id) external view returns (uint256);
}

contract FRAX3CRVLevSwap2 is GeneralLevSwap2 {
  using SafeERC20 for IERC20;

  address private constant POOL = 0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B;
  address private constant THREECRV = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;

  address private constant THREECRV_TOKEN = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490; // 3crv

  address private constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address private constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
  address private constant FRAX = 0x853d955aCEf822Db058eb8505911ED77F175b99e;

  constructor(
    address _asset,
    address _vault,
    address _provider
  ) GeneralLevSwap2(_asset, _vault, _provider) {
    ENABLED_BORROW_ASSETS[DAI] = true;
    ENABLED_BORROW_ASSETS[USDC] = true;
    ENABLED_BORROW_ASSETS[USDT] = true;
  }

  function getAvailableBorrowAssets() external pure override returns (address[] memory assets) {
    assets = new address[](3);
    assets[0] = DAI;
    assets[1] = USDC;
    assets[2] = USDT;
  }

  function _get3CRVPrice() internal view returns (uint256) {
    return
      (((ICurvePool(THREECRV).balances(0) * _getAssetPrice(DAI)) /
        1e18 +
        (ICurvePool(THREECRV).balances(1) * _getAssetPrice(USDC)) /
        1e6 +
        (ICurvePool(THREECRV).balances(2) * _getAssetPrice(USDT)) /
        1e6) * 1e18) / IERC20(THREECRV_TOKEN).totalSupply();
  }

  function _getLPPrice() internal view returns (uint256) {
    return
      (ICurvePool(POOL).balances(0) *
        _getAssetPrice(FRAX) +
        ICurvePool(POOL).balances(1) *
        _getAssetPrice(THREECRV_TOKEN)) / IERC20(COLLATERAL).totalSupply();
  }

  function _getAssetPrice(address _asset) internal view override returns (uint256) {
    if (_asset == THREECRV_TOKEN) return _get3CRVPrice();

    if (_asset == COLLATERAL) return _getLPPrice();

    return ORACLE.getAssetPrice(_asset);
  }

  // FRAX3CRV <-> borrowing asset
  function _processSwap(
    uint256 _amount,
    uint256 _slippage,
    IGeneralLevSwap2.MultipSwapPath memory _path,
    bool _isFrom
  ) internal override returns (uint256) {
    if (_path.swapType > IGeneralLevSwap2.SwapType.NO_SWAP) {
      return
        _swapByPath(
          _amount,
          _slippage,
          _getMinAmount(_path.swapFrom, _path.swapTo, _amount, _slippage),
          _path
        );
    }

    if (_isFrom) {
      // FRAX3CRV -> 3CRV/FRAX
      int256 coinIndex;

      if (_path.swapTo == THREECRV_TOKEN) {
        coinIndex = 1;
      }

      uint256 minAmount = ICurvePool(POOL).calc_withdraw_one_coin(_amount, int128(coinIndex));
      return
        ICurvePool(POOL).remove_liquidity_one_coin(
          _amount,
          int128(coinIndex),
          minAmount,
          address(this)
        );
    }

    // 3CRV/FRAX -> FRAX3CRV
    require(_path.swapTo == COLLATERAL, Errors.LS_INVALID_CONFIGURATION);

    uint256[2] memory amountsAdded;
    uint256 coinIndex;
    address from = _path.swapFrom;
    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));

    IERC20(from).safeApprove(POOL, 0);
    IERC20(from).safeApprove(POOL, _amount);

    if (from == THREECRV_TOKEN) {
      coinIndex = 1;
    }
    amountsAdded[coinIndex] = _amount;

    ICurvePool(POOL).add_liquidity(amountsAdded, 0);
    uint256 amount = IERC20(COLLATERAL).balanceOf(address(this));
    require(
      amount - collateralAmount >= _getMinAmount(from, COLLATERAL, _amount, _slippage),
      Errors.LS_SUPPLY_NOT_ALLOWED
    );

    return amount;
  }
}
