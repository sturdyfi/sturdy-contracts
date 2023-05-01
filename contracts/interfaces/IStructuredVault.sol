// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {IGeneralLevSwap} from './IGeneralLevSwap.sol';

interface IStructuredVault {
  struct AutoExitPositionParams {
    /// exit position params.
    address swapper;
    address borrowAsset;
    address sAsset;
    IGeneralLevSwap.FlashLoanType flashLoanType;
    IGeneralLevSwap.SwapInfo swapInfo;
    /// migration to underlying asset params.
    IGeneralLevSwap.MultipSwapPath[] paths;
  }

  struct AssetInfo {
    uint256 price;
    uint256 decimals;
  }

  struct YieldMigrationParams {
    address yieldAsset;
    /// migration to underlying asset params
    IGeneralLevSwap.MultipSwapPath[] paths;
  }

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
   * @param _params - The params to perform the deleverage and migration to underlying asset
   */
  function withdraw(
    address _to,
    uint256 _amount,
    IStructuredVault.AutoExitPositionParams calldata _params
  ) external;

  /**
   * @dev Set underlying asset address and lptoken info
   * - Caller is vault Admin
   * @param _underlying - The underlying asset address (ex: USDC/USDT/DAI/WETH)
   * @param _name - The vault's lptoken name
   * @param _symbol - The vault's lptoken symbol
   * @param _decimals - The vault's lptoken decimals
   */
  function initUnderlyingAsset(
    address _underlying,
    string memory _name,
    string memory _symbol,
    uint8 _decimals
  ) external payable;

  /**
   * @dev Set the vault fee
   * - Caller is Admin
   * @param fee_ - The fee percentage value. ex 1% = 100
   */
  function setFee(uint256 fee_) external payable;

  /**
   * @dev Set the vault minimum swap loss
   * - Caller is Admin
   * @param swapLoss_ - The minimum swap loss percentage value. ex 1% = 100
   */
  function setSwapLoss(uint256 swapLoss_) external payable;

  /**
   * @dev Authorize the leverage/deleverage contract to handle the collateral, debt and staked internal asset.
   * - Caller is Admin
   * @param _asset - The collateral external asset address
   * @param _swapper - The leverage/deleverage contract address
   * @param _isCollateral - If true, `_asset` is the collateral external asset
   */
  function authorizeSwapper(address _asset, address _swapper, bool _isCollateral) external payable;

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
   * @dev Migration between collateral assets or underlying asset.
   * - Caller is Admin
   * @param _amount - The migration amount of `from` collateral address.
   * @param _paths - The uniswap/balancer/curve swap paths between from asset and to asset
   */
  function migration(
    uint256 _amount,
    IGeneralLevSwap.MultipSwapPath[] calldata _paths
  ) external payable;

  /**
   * @dev Claim Yield and migration to underlying asset and distribute to users by increasing shareIndex
   * - Caller is vault Admin
   * @param _assets - The registered assets to variable yield distributor.
                     Normally these are the staked asset addresss of collateral internal assets
   * @param _amounts - The claiming amounts
   * @param _params - The params to perform the migration between yield asset and underlying asset
   */
  function processYield(
    address[] calldata _assets,
    uint256[] calldata _amounts,
    IStructuredVault.YieldMigrationParams[] calldata _params
  ) external payable;
}
