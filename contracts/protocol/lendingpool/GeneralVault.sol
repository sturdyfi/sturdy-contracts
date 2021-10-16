// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';

contract GeneralVault {
  ILendingPool public immutable lendingPool;

  constructor(ILendingPool _lendingPool) public {
    lendingPool = _lendingPool;
  }

  /**
   * @dev Deposits an `amount` of asset as collateral to borrow other asset.
   * @param _asset The asset address for collateral
   *  _asset = 0x000000000000000000000000000000000000000 means to use ETH as collateral
   * @param _amount The deposit amount
   */
  function depositCollateral(address _asset, uint256 _amount) external payable virtual {
    (uint256 _stAsset, uint256 _stAssetAmount) = depositToYieldPool(_asset, _amount);
    lendingPool.deposit(_stAsset, _stAssetAmount, msg.sender, 0, true);
  }

  /**
   * @dev Withdraw an `amount` of asset used as collateral to user.
   * @param _amount The amount to be withdrawn
   * @param _to Address that will receive the underlying, same as msg.sender if the user
   *   wants to receive it on his own wallet, or a different address if the beneficiary is a
   *   different wallet
   */
  function withdrawCollateral(
    address _asset,
    uint256 _amount,
    address _to
  ) external virtual {
    (uint256 _stAsset, uint256 _stAssetAmount) = getWithdrawalAmount(_asset, _amount);
    uint256 _amountToWithdraw = lendingPool.withdrawFrom(
      _stAsset,
      _stAssetAmount,
      msg.sender,
      this
    );
    withdrawFromYieldPool(_stAsset, _amountToWithdraw, _to);
  }

  /**
   * @dev Get yield based on strategy and re-deposit
   */
  function processYield(address _asset) external virtual {}

  /**
   * @dev Deposit to yield pool based on strategy and receive stAsset
   */
  function depositToYieldPool(address _asset, uint256 _amount) internal virtual {}

  /**
   * @dev Withdraw from yield pool based on strategy with stAsset and deliver asset
   */
  function withdrawFromYieldPool(
    address _stAsset,
    uint256 _amountToWithdraw,
    address _to
  ) internal virtual {}

  /**
   * @dev Get Withdrawal amount of stAsset based on strategy
   */
  function getWithdrawalAmount(address _asset, uint256 _amount) internal virtual {}
}
