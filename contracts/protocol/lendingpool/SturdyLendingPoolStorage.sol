// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';

contract SturdyLendingPoolStorage {
  using SafeMath for uint256;

  address public constant LIDO = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
  address public constant WstETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

  mapping(address => uint256) public balanceOfETH;
  uint256 public totalBalance;

  address internal _lendingPool;
  address internal _curveSwap;

  constructor() public {}
}
