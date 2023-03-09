// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {GeneralLevSwap} from '../GeneralLevSwap.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IBalancerVault} from '../../../interfaces/IBalancerVault.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';

contract AURARETHWETHLevSwap is GeneralLevSwap {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  address internal constant RETH = 0xae78736Cd615f374D3085123A210448E74Fc6393;
  bytes32 internal constant POOLID =
    0x1e19cf2d73a72ef1332c882f20534b6519be0276000200000000000000000112;

  constructor(
    address _asset,
    address _vault,
    address _provider
  ) GeneralLevSwap(_asset, _vault, _provider) {
    ENABLED_BORROWING_ASSET[WETH] = true;
  }

  /**
   * @dev Get the available borrowable asset list.
   * @return assets - the asset list
   **/
  function getAvailableBorrowingAssets() external pure override returns (address[] memory assets) {
    assets = new address[](1);
    assets[0] = WETH;
  }

  /// borrowing asset -> RETHWETH
  function _swapTo(
    address _borrowingAsset,
    uint256 _amount,
    uint256 _slippage
  ) internal override returns (uint256) {
    require(_borrowingAsset == WETH, Errors.LS_INVALID_CONFIGURATION);

    uint256[] memory initBalances = new uint256[](2);
    initBalances[1] = _amount;

    address[] memory assets = new address[](2);
    assets[0] = RETH;
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
    IERC20(WETH).safeApprove(BALANCER_VAULT, 0);
    IERC20(WETH).safeApprove(BALANCER_VAULT, _amount);

    // join pool
    IBalancerVault(BALANCER_VAULT).joinPool(POOLID, address(this), address(this), request);
    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    require(
      collateralAmount >= _getMinAmount(_amount, _slippage, 1e18, _getAssetPrice(COLLATERAL)),
      Errors.LS_SUPPLY_NOT_ALLOWED
    );

    return collateralAmount;
  }

  /// RETHWETH -> borrowing asset
  function _swapFrom(
    address _borrowingAsset,
    uint256 _slippage
  ) internal override returns (uint256) {
    require(_borrowingAsset == WETH, Errors.LS_INVALID_CONFIGURATION);

    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    address[] memory assets = new address[](2);
    assets[0] = RETH;
    assets[1] = WETH;

    uint256[] memory initBalances = new uint256[](2);
    initBalances[1] = _getMinAmount(collateralAmount, _slippage, _getAssetPrice(COLLATERAL), 1e18);

    uint256 exitKind = uint256(IBalancerVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT);
    bytes memory userDataEncoded = abi.encode(exitKind, collateralAmount, 1);

    IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest({
      assets: assets,
      minAmountsOut: initBalances,
      userData: userDataEncoded,
      toInternalBalance: false
    });

    // exit pool
    IBalancerVault(BALANCER_VAULT).exitPool(POOLID, address(this), payable(address(this)), request);

    return IERC20(WETH).balanceOf(address(this));
  }

  function _getMinAmount(
    uint256 _amountToSwap,
    uint256 _slippage,
    uint256 _fromAssetPrice,
    uint256 _toAssetPrice
  ) internal view returns (uint256) {
    return
      ((_amountToSwap * _fromAssetPrice) / _toAssetPrice).percentMul(
        PercentageMath.PERCENTAGE_FACTOR - _slippage
      );
  }
}
