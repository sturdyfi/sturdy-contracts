// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
import 'hardhat/console.sol';
import {SturdyLendingPoolStorage} from './SturdyLendingPoolStorage.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {IWstETH} from '../../interfaces/IWstETH.sol';

contract SturdyLendingPool is SturdyLendingPoolStorage {
  constructor(address lendingPool) public {
    _lendingPool = lendingPool;
  }

  /**
   * @dev Deposits an `amount` of ETH as collateral to borrow asset.
   */
  function depositForCollateral() external payable {
    require(msg.value > 0, 'Has not Ether');

    balanceOfETH[msg.sender] = balanceOfETH[msg.sender].add(msg.value);
    totalBalance = totalBalance.add(msg.value);
    (bool sent, bytes memory data) = LIDO.call{value: msg.value}('');
    require(sent, 'Failed to send Ether');

    // stETH -> wstETH
    IERC20(LIDO).approve(WstETH, msg.value);
    uint256 _wstETHAmount = IWstETH(WstETH).wrap(msg.value);

    // deposit wstETH to LendingPool(Pool2)
    IERC20(WstETH).approve(_lendingPool, _wstETHAmount);
    ILendingPool(_lendingPool).deposit(WstETH, _wstETHAmount, address(this), 0, true);
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
    require(amount <= balance, 'Has not enough amount to withdraw');

    uint256 _wstETHAmount = IWstETH(WstETH).getWstETHByStETH(amount);
    uint256 _amountToWithdraw = ILendingPool(_lendingPool).withdraw(
      WstETH,
      _wstETHAmount,
      address(this)
    );
    uint256 _stETHAmount = IWstETH(WstETH).unwrap(_amountToWithdraw);

    balanceOfETH[msg.sender] = balance.sub(_stETHAmount);

    //ToDo: Convert stETH -> ETH by using curve
  }

  /**
   * @dev Grab excess stETH which was from rebasing on Lido
   * And deposit lendingPool (pool2) to distribute rewards of aToken for suppliers.
   */
  function excessCollect() external returns (uint256) {
    uint256 totalStETH = IERC20(LIDO).balanceOf(address(this));
    uint256 excessStETH = totalStETH.sub(totalBalance);
    if (excessStETH > 0) {
      //ToDo deposit to lendingPool (pool2)
    }

    return excessStETH;
  }
}
