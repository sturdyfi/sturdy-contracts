// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

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

  function remove_liquidity(uint256 _amount, uint256[2] memory _min_amounts)
    external
    returns (uint256);
}

interface IERC20 {
  function balanceOf(address account) external view returns (uint256);
}

contract ReEntrancyTest {
  ICurvePool private constant ETHSTETH = ICurvePool(0xDC24316b9AE028F1497c275EB9192a3Ea0f67022);
  address private constant TOKEN = 0x06325440D014e39736583c165C2963BA99fAf14E;

  receive() external payable {
    attack();
  }

  function check() external {
    uint256 collateralAmount = IERC20(TOKEN).balanceOf(address(this));
    uint256 ethAmount = ETHSTETH.remove_liquidity_one_coin(collateralAmount, 0, 0);
  }

  function attack() internal {
    uint256[2] memory amounts;
    ETHSTETH.remove_liquidity(0, amounts);
  }
}
