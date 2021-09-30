// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
import 'hardhat/console.sol';
import {SturdyLendingPoolStorage} from './SturdyLendingPoolStorage.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';

contract SturdyLendingPool is SturdyLendingPoolStorage {
  constructor() public {}

  /**
   * @dev Perform deposit ETH to LIDO and Receive the stETH.
   */
  function depositETH() external payable {
    require(msg.value > 0, 'Has not Ether');
    (bool sent, bytes memory data) = LIDO.call{value: msg.value}('');
    require(sent, 'Failed to send Ether');
  }

  /**
   * @dev Enable user's withdraw of received stETH.
   */
  function enableWithdrawStETH() external {
    uint256 balance = IERC20(LIDO).balanceOf(address(this));
    require(balance > 0, 'Failed to deposit Ether');
    IERC20(LIDO).approve(msg.sender, balance);
  }
}
