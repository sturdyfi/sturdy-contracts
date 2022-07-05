pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {GeneralLevSwap} from '../GeneralLevSwap.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';

interface CurvePool {
  function coins(int128) external view returns (address);

  function add_liquidity(uint256[4] memory amounts, uint256 _min_mint_amount) external;
}

contract CrvPlain3SUSDLevSwap is GeneralLevSwap {
  using SafeERC20 for IERC20;

  CurvePool public constant POOL = CurvePool(0xA5407eAE9Ba41422680e2e00537571bcC53efBfD);

  address internal constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

  constructor(
    address asset,
    address vault,
    address _provider
  ) GeneralLevSwap(asset, vault, _provider) {
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

  function _getCoinIndex(address stableAsset) internal pure returns (uint256) {
    if (stableAsset == DAI) return 0;
    if (stableAsset == USDC) return 1;
    require(stableAsset == USDT, 'Invalid stable coin');
    return 2;
  }

  function _swap(address stableAsset, uint256 _amount) internal override returns (uint256) {
    // stable coin -> crvPlain3andSUSD
    IERC20(stableAsset).safeApprove(address(POOL), 0);
    IERC20(stableAsset).safeApprove(address(POOL), _amount);

    uint256 coinIndex = _getCoinIndex(stableAsset);
    uint256[4] memory amountsAdded;
    amountsAdded[coinIndex] = _amount;

    POOL.add_liquidity(amountsAdded, 0);

    uint256 amountTo = IERC20(COLLATERAL).balanceOf(address(this));

    return amountTo;
  }
}
