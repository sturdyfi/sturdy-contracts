// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {GeneralLevSwap} from '../GeneralLevSwap.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IBalancerVault} from '../../../interfaces/IBalancerVault.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';

contract AURAWSTETHWETHLevSwap is GeneralLevSwap {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  IBalancerVault public constant WSTETHWETH =
    IBalancerVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);

  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  address internal constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;
  bytes32 internal constant POOLID =
    0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080;

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

  /// borrowing asset -> WSTETHWETH
  function _swapTo(address _borrowingAsset, uint256 _amount) internal override returns (uint256) {
    uint256[] memory initBalances = new uint256[](2);
    initBalances[1] = _amount;

    address[] memory assets = new address[](2);
    assets[0] = WSTETH;
    assets[1] = WETH;

    uint256 joinKind = uint256(IBalancerVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT);
    bytes memory userDataEncoded = abi.encode(joinKind, initBalances);

    IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest({
      assets: assets,
      maxAmountsIn: initBalances,
      userData: userDataEncoded,
      fromInternalBalance: false
    });

    // approve
    IERC20(WETH).safeApprove(address(WSTETHWETH), 0);
    IERC20(WETH).safeApprove(address(WSTETHWETH), _amount);

    // join pool
    WSTETHWETH.joinPool(POOLID, address(this), address(this), request);

    return IERC20(COLLATERAL).balanceOf(address(this));
  }

  /// WSTETHWETH -> borrowing asset
  function _swapFrom(address _borrowingAsset) internal override returns (uint256) {
    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    address[] memory assets = new address[](2);
    assets[0] = WSTETH;
    assets[1] = WETH;

    uint256[] memory initBalances = new uint256[](2);
    initBalances[1] = _getMinAmount(collateralAmount);

    uint256 exitKind = uint256(IBalancerVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT);
    bytes memory userDataEncoded = abi.encode(exitKind, collateralAmount, 1);

    IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest({
      assets: assets,
      minAmountsOut: initBalances,
      userData: userDataEncoded,
      toInternalBalance: false
    });

    // exit pool
    WSTETHWETH.exitPool(POOLID, address(this), payable(address(this)), request);

    return IERC20(WETH).balanceOf(address(this));
  }

  function _getMinAmount(uint256 _amountToSwap) internal view returns (uint256) {
    uint256 fromAssetPrice = _getAssetPrice(COLLATERAL);
    uint256 minAmountOut = ((_amountToSwap * fromAssetPrice) / 1e18).percentMul(9000); //10% slippage

    return minAmountOut;
  }
}
