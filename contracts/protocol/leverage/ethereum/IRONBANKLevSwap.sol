// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {GeneralLevSwap} from '../GeneralLevSwap.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {UniswapAdapter} from '../../libraries/swap/UniswapAdapter.sol';

interface ICurvePool {
  function add_liquidity(
    uint256[3] memory amounts,
    uint256 _min_mint_amount,
    bool _use_underlying
  ) external;

  function calc_withdraw_one_coin(
    uint256 _token_amount,
    int128 i,
    bool _use_underlying
  ) external returns (uint256);

  function remove_liquidity_one_coin(
    uint256 _token_amount,
    int128 i,
    uint256 _min_amount,
    bool _use_underlying
  ) external returns (uint256);
}

contract IRONBANKLevSwap is GeneralLevSwap {
  using SafeERC20 for IERC20;

  ICurvePool public constant IRONBANK = ICurvePool(0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF);

  address internal constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

  constructor(
    address _asset,
    address _vault,
    address _provider
  ) GeneralLevSwap(_asset, _vault, _provider) {
    ENABLED_STABLE_COINS[DAI] = true;
    ENABLED_STABLE_COINS[USDC] = true;
    ENABLED_STABLE_COINS[USDT] = true;
  }

  function getAvailableStableCoins() external pure override returns (address[] memory assets) {
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

  function _swapTo(address _stableAsset, uint256 _amount) internal override returns (uint256) {
    uint256 coinIndex = _getCoinIndex(_stableAsset);

    IERC20(_stableAsset).safeApprove(address(IRONBANK), 0);
    IERC20(_stableAsset).safeApprove(address(IRONBANK), _amount);

    uint256[3] memory amountsAdded;
    amountsAdded[coinIndex] = _amount;
    IRONBANK.add_liquidity(amountsAdded, 0, true);
    return IERC20(COLLATERAL).balanceOf(address(this));
  }

  function _swapFrom(address _stableAsset) internal override returns (uint256) {
    int256 coinIndex = int256(_getCoinIndex(_stableAsset));
    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    uint256 minAmount = IRONBANK.calc_withdraw_one_coin(collateralAmount, int128(coinIndex), true);
    uint256 balanceBefore = IERC20(_stableAsset).balanceOf(address(this));

    IRONBANK.remove_liquidity_one_coin(collateralAmount, int128(coinIndex), minAmount, true);

    return IERC20(_stableAsset).balanceOf(address(this)) - balanceBefore;
  }
}
