// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {GeneralLevSwap} from '../GeneralLevSwap.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {IWETH} from '../../../misc/interfaces/IWETH.sol';

interface ICurvePool {
  function coins(uint256) external view returns (address);

  function add_liquidity(uint256[2] memory amounts, uint256 _min_mint_amount) external payable;

  function calc_withdraw_one_coin(uint256 _token_amount, int128 i) external view returns (uint256);

  function remove_liquidity_one_coin(
    uint256 _token_amount,
    int128 i,
    uint256 _min_amount
  ) external returns (uint256);
}

contract ETHSTETHLevSwap is GeneralLevSwap {
  using SafeERC20 for IERC20;

  ICurvePool public constant ETHSTETH = ICurvePool(0xDC24316b9AE028F1497c275EB9192a3Ea0f67022);

  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /**
   * @dev Receive ETH
   */
  receive() external payable {}

  constructor(
    address _asset,
    address _vault,
    address _provider
  ) GeneralLevSwap(_asset, _vault, _provider) {
    ENABLED_BORROWING_ASSET[WETH] = true;
  }

  function getAvailableStableCoins() external pure override returns (address[] memory assets) {
    assets = new address[](1);
    assets[0] = WETH;
  }

  /// borrowing asset -> ETHSTETH
  function _swapTo(address _borrowingAsset, uint256 _amount) internal override returns (uint256) {
    // WETH -> ETH
    IWETH(WETH).withdraw(_amount);

    uint256[2] memory amountsAdded;
    amountsAdded[0] = _amount;
    ETHSTETH.add_liquidity{value: _amount}(amountsAdded, 0);
    return IERC20(COLLATERAL).balanceOf(address(this));
  }

  /// ETHSTETH -> borrowing asset
  function _swapFrom(address _borrowingAsset) internal override returns (uint256) {
    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    uint256 minAmount = ETHSTETH.calc_withdraw_one_coin(collateralAmount, 0);
    uint256 ethAmount = ETHSTETH.remove_liquidity_one_coin(collateralAmount, 0, minAmount);

    // ETH -> WETH
    IWETH(WETH).deposit{value: ethAmount}();

    return ethAmount;
  }
}
