// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {GeneralLevSwap2} from '../GeneralLevSwap2.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IGeneralLevSwap} from '../../../interfaces/IGeneralLevSwap.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';

contract AURABBAUSDLevSwap is GeneralLevSwap2 {
  address internal constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

  constructor(
    address _asset,
    address _vault,
    address _provider
  ) GeneralLevSwap2(_asset, _vault, _provider) {
    ENABLED_BORROW_ASSETS[DAI] = true;
    ENABLED_BORROW_ASSETS[USDC] = true;
    ENABLED_BORROW_ASSETS[USDT] = true;
  }

  /**
   * @dev Get the available borrowable asset list.
   * @return assets - the asset list
   **/
  function getAvailableBorrowAssets() external pure override returns (address[] memory assets) {
    assets = new address[](3);
    assets[0] = DAI;
    assets[1] = USDC;
    assets[2] = USDT;
  }

  // BB-A-USD <-> borrowing asset
  function _processSwap(
    uint256 _amount,
    uint256 _slippage,
    IGeneralLevSwap.SwapPath memory _path,
    bool
  ) internal override returns (uint256) {
    return _swapByPath(_amount, _slippage, _path);
  }
}
