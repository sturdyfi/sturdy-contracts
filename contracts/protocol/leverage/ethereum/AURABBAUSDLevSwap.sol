// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {GeneralLevSwap} from '../GeneralLevSwap.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IBalancerVault} from '../../../interfaces/IBalancerVault.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';

contract AURABBAUSDLevSwap is GeneralLevSwap {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  address internal constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
  address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
  address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

  address internal constant ADAI = 0x02d60b84491589974263d922D9cC7a3152618Ef6;
  address internal constant AUSDC = 0xd093fA4Fb80D09bB30817FDcd442d4d02eD3E5de;
  address internal constant AUSDT = 0xf8Fd466F12e236f4c96F7Cce6c79EAdB819abF58;

  address internal constant BAL_BB_A_USDC = 0x82698aeCc9E28e9Bb27608Bd52cF57f704BD1B83;
  address internal constant BAL_BB_A_USDT = 0x2F4eb100552ef93840d5aDC30560E5513DFfFACb;
  address internal constant BAL_BB_A_DAI = 0xae37D54Ae477268B9997d4161B96b8200755935c;

  bytes32 internal constant POOLID =
    0xa13a9247ea42d743238089903570127dda72fe4400000000000000000000035d;
  bytes32 internal constant USDC_POOLID =
    0x82698aecc9e28e9bb27608bd52cf57f704bd1b83000000000000000000000336;
  bytes32 internal constant USDT_POOLID =
    0x2f4eb100552ef93840d5adc30560e5513dfffacb000000000000000000000334;
  bytes32 internal constant DAI_POOLID =
    0xae37d54ae477268b9997d4161b96b8200755935c000000000000000000000337;

  constructor(
    address _asset,
    address _vault,
    address _provider
  ) GeneralLevSwap(_asset, _vault, _provider) {
    ENABLED_STABLE_COINS[DAI] = true;
    ENABLED_STABLE_COINS[USDC] = true;
    ENABLED_STABLE_COINS[USDT] = true;
  }

  /**
   * @dev Get the available borrowable asset list.
   * @return assets - the asset list
   **/
  function getAvailableStableCoins() external pure override returns (address[] memory assets) {
    assets = new address[](3);
    assets[0] = DAI;
    assets[1] = USDC;
    assets[2] = USDT;
  }

  function _getCoinIndex(address _borrowingAsset) internal pure returns (uint256) {
    if (_borrowingAsset == DAI) return 0;
    if (_borrowingAsset == USDC) return 1;
    require(_borrowingAsset == USDT, 'Invalid stable coin');
    return 2;
  }

  /// borrowing asset -> Linear Pool LP
  function _swapLinearPoolLP(address _borrowingAsset, uint256 _amount) internal returns (uint256) {
    bytes32 poolID;
    address lpToken;
    uint256[] memory initBalances = new uint256[](2);
    initBalances[0] = _amount;

    address[] memory assets = new address[](2);
    if (_borrowingAsset == USDC) {
      assets[0] = USDC;
      assets[1] = AUSDC;
      poolID = USDC_POOLID;
      lpToken = BAL_BB_A_USDC;
    } else if (_borrowingAsset == USDT) {
      assets[0] = USDT;
      assets[1] = AUSDT;
      poolID = USDT_POOLID;
      lpToken = BAL_BB_A_USDT;
    } else {
      assets[0] = DAI;
      assets[1] = ADAI;
      poolID = DAI_POOLID;
      lpToken = BAL_BB_A_DAI;
    }

    uint256 joinKind = uint256(IBalancerVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT);
    bytes memory userDataEncoded = abi.encode(joinKind, initBalances);

    IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest({
      assets: assets,
      maxAmountsIn: initBalances,
      userData: userDataEncoded,
      fromInternalBalance: false
    });

    // approve
    IERC20(_borrowingAsset).safeApprove(BALANCER_VAULT, 0);
    IERC20(_borrowingAsset).safeApprove(BALANCER_VAULT, _amount);

    // join pool
    IBalancerVault(BALANCER_VAULT).joinPool(poolID, address(this), address(this), request);
    return IERC20(lpToken).balanceOf(address(this));
  }

  /// borrowing asset -> BB-A-USD
  function _swapTo(
    address _borrowingAsset,
    uint256 _amount,
    uint256 _slippage
  ) internal override returns (uint256) {
    uint256 assetIndex = _getCoinIndex(_borrowingAsset);
    uint256[] memory initBalances = new uint256[](3);
    initBalances[assetIndex] = _swapLinearPoolLP(_borrowingAsset, _amount);

    address[] memory assets = new address[](3);
    assets[0] = BAL_BB_A_DAI;
    assets[1] = BAL_BB_A_USDC;
    assets[2] = BAL_BB_A_USDT;

    uint256 joinKind = uint256(IBalancerVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT);
    bytes memory userDataEncoded = abi.encode(joinKind, initBalances);

    IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest({
      assets: assets,
      maxAmountsIn: initBalances,
      userData: userDataEncoded,
      fromInternalBalance: false
    });

    // approve
    IERC20(assets[assetIndex]).safeApprove(BALANCER_VAULT, 0);
    IERC20(assets[assetIndex]).safeApprove(BALANCER_VAULT, _amount);

    // join pool
    IBalancerVault(BALANCER_VAULT).joinPool(POOLID, address(this), address(this), request);
    uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    require(
      collateralAmount >= _getMinAmount(_borrowingAsset, COLLATERAL, _amount, _slippage),
      Errors.LS_SUPPLY_NOT_ALLOWED
    );

    return collateralAmount;
  }

  /// BB-A-USD -> borrowing asset
  function _swapFrom(
    address _borrowingAsset,
    uint256 _slippage
  ) internal override returns (uint256) {
    // require(_borrowingAsset == WETH, Errors.LS_INVALID_CONFIGURATION);
    // uint256 collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    // address[] memory assets = new address[](2);
    // assets[0] = RETH;
    // assets[1] = WETH;
    // uint256[] memory initBalances = new uint256[](2);
    // initBalances[1] = _getMinAmount(collateralAmount, _slippage, _getAssetPrice(COLLATERAL), 1e18);
    // uint256 exitKind = uint256(IBalancerVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT);
    // bytes memory userDataEncoded = abi.encode(exitKind, collateralAmount, 1);
    // IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest({
    //   assets: assets,
    //   minAmountsOut: initBalances,
    //   userData: userDataEncoded,
    //   toInternalBalance: false
    // });
    // // exit pool
    // IBalancerVault(BALANCER_VAULT).exitPool(POOLID, address(this), payable(address(this)), request);
    // return IERC20(WETH).balanceOf(address(this));
  }
}
