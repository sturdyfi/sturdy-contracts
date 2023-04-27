// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {StructuredVault, IGeneralLevSwap, IERC20, Errors} from './StructuredVault.sol';
import {ICurvePool} from '../../../interfaces/ICurvePool.sol';

/**
 * @title StableStructuredVault
 * @notice stable assets structured vault
 * @author Sturdy
 **/

contract StableStructuredVault is StructuredVault {
  address private constant DAI_USDC_USDT_SUSD_LP = 0xC25a3A3b969415c80451098fa907EC722572917F;
  address private constant DAI_USDC_USDT_SUSD_POOL = 0xA5407eAE9Ba41422680e2e00537571bcC53efBfD;
  address private constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address private constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

  function _getCoinIndex(address _stableAsset) internal pure returns (uint256) {
    if (_stableAsset == DAI) return 0;
    if (_stableAsset == USDC) return 1;
    require(_stableAsset == USDT, Errors.VT_INVALID_CONFIGURATION);
    return 2;
  }

  function _processSwap(
    uint256 _amount,
    IGeneralLevSwap.MultipSwapPath memory _path
  ) internal override returns (uint256) {
    if (_path.swapType > IGeneralLevSwap.SwapType.NO_SWAP) {
      return _swapByPath(_amount, _path);
    }

    require(_path.swapFrom == DAI_USDC_USDT_SUSD_LP, Errors.VT_INVALID_CONFIGURATION);

    address to = _path.swapTo;
    uint256 coinIndex = _getCoinIndex(to);
    uint256[4] memory amounts;

    // receivable stable asset amount
    amounts[coinIndex] = _path.outAmount;

    // Withdraw a single asset from the pool
    ICurvePool(DAI_USDC_USDT_SUSD_POOL).remove_liquidity_imbalance(amounts, _path.inAmount);

    return IERC20(to).balanceOf(address(this));
  }
}
