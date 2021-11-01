// SPDX-License-Identifier: agpl-3.0
pragma solidity >=0.6.12;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {Errors} from '../libraries/helpers/Errors.sol';

contract GeneralVault is Ownable {
  using SafeMath for uint256;

  address public immutable lendingPool;

  constructor(address _lendingPool) public {
    lendingPool = _lendingPool;
  }

  /**
   * @dev Deposits an `amount` of asset as collateral to borrow other asset.
   * @param _asset The asset address for collateral
   *  _asset = 0x000000000000000000000000000000000000000 means to use ETH as collateral
   * @param _amount The deposit amount
   */
  function depositCollateral(address _asset, uint256 _amount) external payable virtual {
    // Deposit asset to vault and receive stAsset
    // Ex: if user deposit 100ETH, this will deposit 100ETH to Lido and receive 100stETH
    (address _stAsset, uint256 _stAssetAmount) = _depositToYieldPool(_asset, _amount);

    // Deposit stAsset to lendingPool, then user will get aToken of stAsset
    ILendingPool(lendingPool).deposit(_stAsset, _stAssetAmount, msg.sender, 0, true);
  }

  /**
   * @dev Withdraw an `amount` of asset used as collateral to user.
   * @param _asset The asset address for collateral
   *  _asset = 0x000000000000000000000000000000000000000 means to use ETH as collateral
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
    // Before withdraw from lending pool, get the stAsset address and withdrawal amount
    // Ex: In Lido vault, it will return stETH address and same amount
    (address _stAsset, uint256 _stAssetAmount) = _getWithdrawalAmount(_asset, _amount);

    // withdraw from lendingPool, it will convert user's aToken to stAsset
    uint256 _amountToWithdraw = ILendingPool(lendingPool).withdrawFrom(
      _stAsset,
      _stAssetAmount,
      msg.sender,
      address(this)
    );

    // Withdraw from vault, it will convert stAsset to asset and send to user
    // Ex: In Lido vault, it will return ETH or stETH to user
    _withdrawFromYieldPool(_asset, _amountToWithdraw, _to);
  }

  /**
   * @dev Get yield based on strategy and re-deposit
   */
  function processYield() external virtual {}

  /**
   * @dev Get yield based on strategy and re-deposit
   */
  function _getYield(address _stAsset) internal returns (uint256) {
    uint256 yieldStAsset = _getYieldAmount(_stAsset);
    require(yieldStAsset > 0, Errors.VT_PROCESS_YIELD_INVALID);

    ILendingPool(lendingPool).getYield(_stAsset, yieldStAsset);
    return yieldStAsset;
  }

  /**
   * @dev Get yield amount based on strategy
   */
  function _getYieldAmount(address _stAsset) internal view returns (uint256) {
    (uint256 stAssetBalance, uint256 aTokenBalance) = ILendingPool(lendingPool)
      .getTotalBalanceOfAssetPair(_stAsset);

    // when deposit for collateral, stAssetBalance = aTokenBalance
    // But stAssetBalance should increase overtime, so vault can grab yield from lendingPool.
    // yield = stAssetBalance - aTokenBalance
    if (stAssetBalance >= aTokenBalance) return stAssetBalance.sub(aTokenBalance);

    return 0;
  }

  function _depositYield(address _asset, uint256 _amount) internal {
    ILendingPool(lendingPool).depositYield(_asset, _amount);
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive stAsset
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    virtual
    returns (address, uint256)
  {}

  /**
   * @dev Withdraw from yield pool based on strategy with stAsset and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal virtual {}

  /**
   * @dev Get Withdrawal amount of stAsset based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    virtual
    returns (address, uint256)
  {}
}
