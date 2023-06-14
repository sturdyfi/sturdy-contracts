// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {IBalancerVault} from '../interfaces/IBalancerVault.sol';

/**
 * @title TestContract
 * @notice TestContract
 * @author Sturdy
 **/

interface ICurvePool {
  function withdraw_admin_fees() external;

  function remove_liquidity_one_coin(
    uint256 _burn_amount,
    int128 i,
    uint256 _min_received
  ) external returns (uint256);

  function remove_liquidity(
    uint256 _amount,
    uint256[2] memory _min_amounts
  ) external returns (uint256);
}

interface IERC20 {
  function balanceOf(address account) external view returns (uint256);

  function approve(address spender, uint256 amount) external returns (bool);
}

interface IGeneralVault {
  function depositCollateral(address _asset, uint256 _amount) external payable;
}

interface ILendingPool {
  function borrow(
    address asset,
    uint256 amount,
    uint256 interestRateMode,
    uint16 referralCode,
    address onBehalfOf
  ) external;

  function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
}

contract ReEntrancyTest {
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  address internal constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;
  ILendingPool private constant POOL = ILendingPool(0x2A4d822BFB34d377c978F28a6C332Caa2fF87530);

  ICurvePool private constant ETHSTETH = ICurvePool(0xDC24316b9AE028F1497c275EB9192a3Ea0f67022);
  address private constant COLLATERAL_ETHSTETH = 0x06325440D014e39736583c165C2963BA99fAf14E;
  IGeneralVault private constant CVX_ETH_STETH_VAULT =
    IGeneralVault(0x8d58c3574A6D32F5F848Abe8E7A03E8B92577c15);

  IBalancerVault internal constant BALANCER_VAULT =
    IBalancerVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
  address private constant COLLATERAL_BALWSTETHWETH = 0x32296969Ef14EB0c6d29669C550D4a0449130230;
  bytes32 internal constant BALWSTETHWETH_POOLID =
    0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080;
  IGeneralVault private constant AURA_WSTETH_WETH_VAULT =
    IGeneralVault(0x830647b95f38Af9e5811B4f140a9053b93322f08);

  bool private isCheckEnabled;
  uint256 private collateralAmount;

  receive() external payable {
    if (isCheckEnabled) _borrowWETHFromPool(collateralAmount / 6);
  }

  function test_cvx_eth_steth() external {
    collateralAmount = IERC20(COLLATERAL_ETHSTETH).balanceOf(address(this));
    uint256 wethAmount = IERC20(WETH).balanceOf(address(this));

    //make test env
    _depositWETHToPool(wethAmount);
    _depositCollateralToVault(
      collateralAmount / 2,
      COLLATERAL_ETHSTETH,
      address(CVX_ETH_STETH_VAULT)
    );

    //make re-entrancy case
    uint256 ethAmount = ETHSTETH.remove_liquidity_one_coin(collateralAmount / 2 - 1, 0, 0);
    require(ethAmount > 0);

    //borrow
    _borrowWETHFromPool(collateralAmount / 6);
  }

  function test_aura_wsteth_weth() external {
    collateralAmount = IERC20(COLLATERAL_BALWSTETHWETH).balanceOf(address(this));
    uint256 wethAmount = IERC20(WETH).balanceOf(address(this));

    //make test env
    _depositWETHToPool(wethAmount);
    _depositCollateralToVault(
      collateralAmount / 2,
      COLLATERAL_BALWSTETHWETH,
      address(AURA_WSTETH_WETH_VAULT)
    );

    //make re-entrancy case
    address[] memory assets = new address[](2);
    assets[0] = WSTETH;
    assets[1] = address(0); //ETH

    uint256[] memory initBalances = new uint256[](2);
    uint256 exitKind = uint256(IBalancerVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT);
    bytes memory userDataEncoded = abi.encode(exitKind, collateralAmount / 2 - 1, 1);

    IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest({
      assets: assets,
      minAmountsOut: initBalances,
      userData: userDataEncoded,
      toInternalBalance: false
    });

    // exit pool
    BALANCER_VAULT.exitPool(BALWSTETHWETH_POOLID, address(this), payable(address(this)), request);

    //borrow
    _borrowWETHFromPool(collateralAmount / 6);
  }

  function _depositWETHToPool(uint256 amount) internal {
    IERC20(WETH).approve(address(POOL), amount);
    POOL.deposit(WETH, amount, address(this), 0);
  }

  function _depositCollateralToVault(uint256 amount, address collateral, address vault) internal {
    IERC20(collateral).approve(vault, amount);
    IGeneralVault(vault).depositCollateral(collateral, amount);
  }

  function _borrowWETHFromPool(uint256 amount) internal {
    POOL.borrow(WETH, amount, 2, 0, address(this));
  }

  function enableCheck() external {
    isCheckEnabled = true;
  }
}
