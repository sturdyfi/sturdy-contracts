// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {GeneralLevSwap2} from '../GeneralLevSwap2.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IGeneralLevSwap2} from '../../../interfaces/IGeneralLevSwap2.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';

interface ICurvePool {
  function coins(uint256) external view returns (address);

  function add_liquidity(uint256[2] memory amounts, uint256 _min_mint_amount) external;

  function calc_withdraw_one_coin(uint256 _token_amount, int128 i) external view returns (uint256);

  function remove_liquidity_one_coin(
    uint256 _token_amount,
    int128 i,
    uint256 _min_amount
  ) external returns (uint256);

  function balances(uint256 _id) external view returns (uint256);
}

contract FRAXUSDCLevSwap2 is GeneralLevSwap2 {
  using SafeERC20 for IERC20;

  address private constant FRAXUSDC = 0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2;

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

  function _getLPPrice() internal view returns (uint256) {
    return
      (((ICurvePool(FRAXUSDC).balances(0) * _getAssetPrice(FRAX)) /
        1e18 +
        (ICurvePool(FRAXUSDC).balances(1) * _getAssetPrice(USDC)) /
        1e6) * 1e18) / IERC20(COLLATERAL).totalSupply();
  }

  function _getAssetPrice(address _asset) internal view override returns (uint256) {
    if (_asset == COLLATERAL) return _getLPPrice();

    return ORACLE.getAssetPrice(_asset);
  }

  // FRAXUSDC <-> borrowing asset
  function _processSwap(
    uint256 _amount,
    uint256 _slippage,
    IGeneralLevSwap2.MultipSwapPath memory _path,
    bool
  ) internal override returns (uint256) {
    return
      _swapByPath(
        _amount,
        _slippage,
        _getMinAmount(_path.swapFrom, _path.swapTo, _amount, _slippage),
        _path
      );
  }
}
