// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {GeneralLevSwap2} from '../GeneralLevSwap2.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IGeneralLevSwap2} from '../../../interfaces/IGeneralLevSwap2.sol';
import {ICurvePool} from '../../../interfaces/ICurvePool.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';

contract DAIUSDCUSDTSUSDLevSwap is GeneralLevSwap2 {
  using SafeERC20 for IERC20;

  address private constant POOL = 0xA5407eAE9Ba41422680e2e00537571bcC53efBfD;
  address private constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address private constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

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

  function _getCoinIndex(address _stableAsset) internal pure returns (uint256) {
    if (_stableAsset == DAI) return 0;
    if (_stableAsset == USDC) return 1;
    require(_stableAsset == USDT, 'Invalid stable coin');
    return 2;
  }

  // DAIUSDCUSDTSUSD <-> borrowing asset
  function _processSwap(
    uint256 _amount,
    IGeneralLevSwap2.MultipSwapPath memory _path,
    bool _isFrom,
    bool _checkOutAmount
  ) internal override returns (uint256) {
    if (_path.swapType > IGeneralLevSwap2.SwapType.NO_SWAP) {
      return _swapByPath(_amount, _path, _checkOutAmount);
    }

    if (_isFrom) {
      // DAIUSDCUSDTSUSD -> borrowing asset
      require(_checkOutAmount == true, Errors.LS_INVALID_CONFIGURATION);

      address to = _path.swapTo;
      uint256 coinIndex = _getCoinIndex(to);
      uint256[4] memory amounts;

      // receivable stable asset amount
      amounts[coinIndex] = _path.outAmount;

      // Withdraw a single asset from the pool
      ICurvePool(POOL).remove_liquidity_imbalance(amounts, _path.inAmount);

      return IERC20(to).balanceOf(address(this));
    }
  }
}
