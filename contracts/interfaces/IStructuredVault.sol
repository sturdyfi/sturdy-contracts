// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {IGeneralLevSwap} from './IGeneralLevSwap.sol';

interface IStructuredVault {
  /**
   * @dev Deposits an `_amount` of underlying asset.
   * - Caller is anyone
   * @param _from The depositor address
   * @param _amount The deposit amount
   */
  function deposit(address _from, uint256 _amount) external;

  /**
   * @dev Withdraws an `_amount` of underlying asset.
   * - Caller is anyone
   * @param _to The address that will receive the underlying asset, same as msg.sender if the user
   *   wants to receive it on his own wallet, or a different address if the beneficiary is a
   *   different wallet
   * @param _amount The withdrawal amount
   */
  function withdraw(address _to, uint256 _amount) external;

  /**
   * @dev Set the vault fee
   * - Caller is Admin
   * @param fee_ - The fee percentage value. ex 1% = 100
   */
  function setFee(uint256 fee_) external payable;

  /**
   * @dev Authorize the leverage/deleverage contract to handle the collateral, debt and staked internal asset.
   * - Caller is Admin
   * @param _collateralAsset - The collateral external asset address
   * @param _swapper - The leverage/deleverage contract address
   */
  function authorizeSwapper(address _collateralAsset, address _swapper) external payable;

  /**
   * @dev Leverage an `_amount` of collateral asset via `_swapper`.
   * - Caller is Admin
   * @param _swapper - The leverage/deleverage contract address
   * @param _amount - The amount of collateral
   * @param _leverage - Extra leverage value and must be greater than 0, ex. 300% = 300_00
   *                    _amount + _amount * _leverage should be used as collateral
   * @param _borrowAsset - The borrowing asset address when leverage works
   * @param _flashLoanType - 0 is Aave, 1 is Balancer
   * @param _zapPaths - The uniswap/balancer/curve swap paths between underlying asset and collateral
   * @param _zapPathLength - The uniswap/balancer/curve swap path length between underlying asset and collateral
                             if this value is 0, it means normal leverage if not, it means zapLeverage
   * @param _swapInfo - The uniswap/balancer/curve swap paths between borrowAsset and collateral
   */
  function enterPosition(
    address _swapper,
    uint256 _amount,
    uint256 _leverage,
    address _borrowAsset,
    IGeneralLevSwap.FlashLoanType _flashLoanType,
    IGeneralLevSwap.MultipSwapPath[3] calldata _zapPaths,
    uint256 _zapPathLength,
    IGeneralLevSwap.SwapInfo calldata _swapInfo
  ) external payable;

  /**
   * @dev Deleverage an `_requiredAmount` of collateral asset via `_swapper`.
   * - Caller is Admin
   * @param _swapper -  The leverage/deleverage contract address
   * @param _repayAmount - The amount of repay
   * @param _requiredAmount - The amount of collateral
   * @param _borrowAsset - The borrowing asset address when leverage works
   * @param _sAsset - staked asset address of collateral internal asset
   * @param _flashLoanType - 0 is Aave, 1 is Balancer
   * @param _swapInfo - The uniswap/balancer/curve swap infos between borrowAsset and collateral
   */
  function exitPosition(
    address _swapper,
    uint256 _repayAmount,
    uint256 _requiredAmount,
    address _borrowAsset,
    address _sAsset,
    IGeneralLevSwap.FlashLoanType _flashLoanType,
    IGeneralLevSwap.SwapInfo calldata _swapInfo
  ) external payable;

  /**
   * @dev Leverage an `_amount` of collateral asset via `_swapper`.
   * - Caller is Admin
   * @param _fromAsset - The migration `from` collateral address.
   * @param _toAsset - The migration `to` asset address. (collateral address or underlying asset address)
   * @param _amount - The migration amount of `from` collateral address.
   * @param _paths - The uniswap/balancer/curve swap paths between from asset and to asset
   * @param _pathLength - The uniswap/balancer/curve swap path length between from asset and to asset
   */
  function migration(
    address _fromAsset,
    address _toAsset,
    uint256 _amount,
    IGeneralLevSwap.MultipSwapPath[5] calldata _paths,
    uint256 _pathLength
  ) external payable;
}
