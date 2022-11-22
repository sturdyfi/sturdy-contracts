// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {GeneralLevSwap} from '../GeneralLevSwap.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';

interface ICurvePool {
  function coins(int128) external view returns (address);

  function add_liquidity(uint256[4] memory amounts, uint256 _min_mint_amount) external;

  function remove_liquidity_imbalance(uint256[4] calldata amounts, uint256 max_burn_amount)
    external;
}

contract DAIUSDCUSDTSUSDLevSwap is GeneralLevSwap {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  ICurvePool public constant POOL = ICurvePool(0xA5407eAE9Ba41422680e2e00537571bcC53efBfD);

  address internal constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

  constructor(
    address _asset,
    address _vault,
    address _provider
  ) GeneralLevSwap(_asset, _vault, _provider) {
    ENABLED_BORROWING_ASSET[DAI] = true;
    ENABLED_BORROWING_ASSET[USDC] = true;
    ENABLED_BORROWING_ASSET[USDT] = true;
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
    // stable coin -> DAIUSDCUSDTSUSD
    IERC20(_stableAsset).safeApprove(address(POOL), 0);
    IERC20(_stableAsset).safeApprove(address(POOL), _amount);

    uint256 coinIndex = _getCoinIndex(_stableAsset);
    uint256[4] memory amountsAdded;
    amountsAdded[coinIndex] = _amount;

    POOL.add_liquidity(amountsAdded, 0);

    uint256 amountTo = IERC20(COLLATERAL).balanceOf(address(this));

    return amountTo;
  }

  function _swapFrom(address _stableAsset) internal override returns (uint256) {
    // DAIUSDCUSDTSUSD -> stable coin
    uint256 coinIndex = _getCoinIndex(_stableAsset);
    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    uint256 stableAssetDecimals = IERC20Detailed(_stableAsset).decimals();
    uint256[4] memory amounts;
    // calculate expected receivable stable asset amount with 2% slippage
    amounts[coinIndex] = ((((collateralAmount * ORACLE.getAssetPrice(COLLATERAL)) /
      ORACLE.getAssetPrice(_stableAsset)) * 10**stableAssetDecimals) / 10**DECIMALS).percentMul(
        98_00
      );

    // Withdraw a single asset from the pool
    POOL.remove_liquidity_imbalance(amounts, collateralAmount);

    return IERC20(_stableAsset).balanceOf(address(this));
  }
}
