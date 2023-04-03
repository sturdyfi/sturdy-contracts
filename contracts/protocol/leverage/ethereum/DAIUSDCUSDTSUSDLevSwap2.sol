// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {GeneralLevSwap2} from '../GeneralLevSwap2.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IGeneralLevSwap2} from '../../../interfaces/IGeneralLevSwap2.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';

interface ICurvePool {
  function coins(int128) external view returns (address);

  function add_liquidity(uint256[4] memory amounts, uint256 _min_mint_amount) external;

  function remove_liquidity_imbalance(
    uint256[4] calldata amounts,
    uint256 max_burn_amount
  ) external;

  function balances(int128 _id) external view returns (uint256);
}

contract DAIUSDCUSDTSUSDLevSwap2 is GeneralLevSwap2 {
  using SafeERC20 for IERC20;

  address private constant POOL = 0xA5407eAE9Ba41422680e2e00537571bcC53efBfD;

  address private constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address private constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
  address private constant SUSD = 0x57Ab1ec28D129707052df4dF418D58a2D46d5f51;

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

  function _getLPPrice() internal view returns (uint256) {
    return
      (((ICurvePool(POOL).balances(0) * _getAssetPrice(DAI)) /
        1e18 +
        (ICurvePool(POOL).balances(1) * _getAssetPrice(USDC)) /
        1e6 +
        (ICurvePool(POOL).balances(2) * _getAssetPrice(USDT)) /
        1e6 +
        (ICurvePool(POOL).balances(3) * _getAssetPrice(SUSD)) /
        1e18) * 1e18) / IERC20(COLLATERAL).totalSupply();
  }

  function _getAssetPrice(address _asset) internal view override returns (uint256) {
    if (_asset == COLLATERAL) return _getLPPrice();

    return ORACLE.getAssetPrice(_asset);
  }

  // DAIUSDCUSDTSUSD <-> borrowing asset
  function _processSwap(
    uint256 _amount,
    uint256 _slippage,
    IGeneralLevSwap2.MultipSwapPath memory _path,
    bool _isFrom
  ) internal override returns (uint256) {
    if (_path.swapType > IGeneralLevSwap2.SwapType.NO_SWAP) {
      return _swapByPath(_amount, _slippage, 0, _path);
    }

    if (_isFrom) {
      // DAIUSDCUSDTSUSD -> borrowing asset
      address to = _path.swapTo;
      uint256 coinIndex = _getCoinIndex(to);
      uint256[4] memory amounts;

      // calculate expected receivable stable asset amount with slippage
      amounts[coinIndex] = _getMinAmount(COLLATERAL, to, _amount, _slippage);

      // Withdraw a single asset from the pool
      ICurvePool(POOL).remove_liquidity_imbalance(amounts, _amount);

      return IERC20(to).balanceOf(address(this));
    }

    // borrowing asset -> DAIUSDCUSDTSUSD
    require(_path.swapTo == COLLATERAL, Errors.LS_INVALID_CONFIGURATION);

    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    address from = _path.swapFrom;

    IERC20(from).safeApprove(POOL, 0);
    IERC20(from).safeApprove(POOL, _amount);

    uint256 coinIndex = _getCoinIndex(from);
    uint256[4] memory amountsAdded;
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
