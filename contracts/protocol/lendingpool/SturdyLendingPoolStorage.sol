// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

contract SturdyLendingPoolStorage {
  address internal constant LIDO = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
  address internal constant CurveSwap = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022;

  mapping(address => uint256) public balanceOfETH;
  uint256 public totalBalance;

  constructor() public {}
}
