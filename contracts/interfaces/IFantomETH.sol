// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

interface IFantomETH {
  function Swapin(
    bytes32 txhash,
    address account,
    uint256 amount
  ) external returns (bool);

  function balanceOf(address account) external view returns (uint256);

  function approve(address spender, uint256 amount) external returns (bool);
}
