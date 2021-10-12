// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';
import {LendingPool} from './LendingPool.sol';
import {SturdyLendingPoolLogic} from '../libraries/logic/SturdyLendingPoolLogic.sol';

contract SturdyLendingPool is LendingPool {
  /**
   * @dev Receive Ether
   */
  receive() external payable {}

  /**
   * @dev Deposits an `amount` of ETH as collateral to borrow asset.
   */
  function depositForCollateral() external payable whenNotPaused {
    uint256 _wstETHAmount = SturdyLendingPoolLogic.getCollateralAmount(WstETH);
    _deposit(WstETH, _wstETHAmount, msg.sender, 0, true);
  }

  /**
   * @dev Withdraw an `amount` of ETH used as collateral to user.
   * @param amount The amount to be withdrawn
   * @param to Address that will receive the underlying, same as msg.sender if the user
   *   wants to receive it on his own wallet, or a different address if the beneficiary is a
   *   different wallet
   */
  function withdrawFromCollateral(uint256 amount, address to) external whenNotPaused {
    uint256 _wstETHAmount = SturdyLendingPoolLogic.getWithdrawalAmount(WstETH, amount);
    uint256 _amountToWithdraw = _withdraw(WstETH, _wstETHAmount, address(this));
    SturdyLendingPoolLogic.processWithdraw(WstETH, _amountToWithdraw, to);
  }

  // /**
  //  * @dev Grab excess stETH which was from rebasing on Lido
  //  * And deposit lendingPool (pool2) to distribute rewards of aToken for suppliers.
  //  */
  // function excessCollect() external returns (uint256) {
  //   uint256 totalStETH = IERC20(LIDO).balanceOf(address(this));
  //   uint256 excessStETH = totalStETH.sub(totalBalance);
  //   if (excessStETH > 0) {
  //     //ToDo deposit to lendingPool (pool2)
  //   }

  //   return excessStETH;
  // }
}
