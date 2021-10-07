// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';
import {SturdyLendingPoolStorage} from './SturdyLendingPoolStorage.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {LendingPool} from './LendingPool.sol';
import {IWstETH} from '../../interfaces/IWstETH.sol';
import {ICurveSwap} from '../../interfaces/ICurveSwap.sol';
import {Errors} from '../libraries/helpers/Errors.sol';

contract SturdyLendingPool is LendingPool, SturdyLendingPoolStorage {
  /**
   * @dev Receive Ether
   */
  receive() external payable {}

  /**
   * @dev Deposits an `amount` of ETH as collateral to borrow asset.
   */
  function depositForCollateral() external payable whenNotPaused {
    require(msg.value > 0, Errors.ST_COLLATORAL_DEPOSIT_REQUIRE_ETH);

    balanceOfETH[msg.sender] = balanceOfETH[msg.sender].add(msg.value);
    totalBalance = totalBalance.add(msg.value);
    (bool sent, bytes memory data) = LIDO.call{value: msg.value}('');
    require(sent, Errors.ST_COLLATORAL_DEPOSIT_INVALID);

    // stETH -> wstETH
    IERC20(LIDO).approve(WstETH, msg.value);
    uint256 _wstETHAmount = IWstETH(WstETH).wrap(msg.value);

    // deposit wstETH to Pool
    _deposit(WstETH, _wstETHAmount, msg.sender, 0, true);
  }

  /**
   * @dev Withdraw an `amount` of ETH used as collateral to user.
   * @param amount The amount to be withdrawn
   * @param to Address that will receive the underlying, same as msg.sender if the user
   *   wants to receive it on his own wallet, or a different address if the beneficiary is a
   *   different wallet
   */
  function withdrawFromCollateral(uint256 amount, address to) external {
    uint256 balance = balanceOfETH[msg.sender];
    require(amount <= balance, Errors.ST_COLLATORAL_WITHDRAW_INVALID_AMOUNT);

    uint256 _wstETHAmount = IWstETH(WstETH).getWstETHByStETH(amount);
    uint256 _amountToWithdraw = _withdraw(WstETH, _wstETHAmount, address(this));
    uint256 _stETHAmount = IWstETH(WstETH).unwrap(_amountToWithdraw);

    balanceOfETH[msg.sender] = balance.sub(_stETHAmount);

    // Exchange stETH -> ETH via Curve
    IERC20(LIDO).approve(CurveSwap, _stETHAmount);
    uint256 _minAmount = ICurveSwap(CurveSwap).get_dy(1, 0, _stETHAmount);
    uint256 _receivedAmount = ICurveSwap(CurveSwap).exchange(1, 0, _stETHAmount, _minAmount);
    (bool sent, bytes memory data) = address(msg.sender).call{value: _receivedAmount}('');
    require(sent, Errors.ST_COLLATORAL_WITHDRAW_INVALID);
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
