// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';
import {GeneralVault} from './GeneralVault.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IYearnVault} from '../../interfaces/IYearnVault.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';

/**
 * @title YearnVault
 * @notice yvWFTM/WFTM Vault by using Yearn on Fantom
 * @author Sturdy
 **/

contract YearnVault is GeneralVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  /**
   * @dev Deposit to yield pool based on strategy and receive yvWFTM
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    address YVWFTM = _addressesProvider.getAddress('YVWFTM');
    address WFTM = _addressesProvider.getAddress('WFTM');

    // Transfer WFTM from user to vault
    require(_asset == WFTM, Errors.VT_COLLATORAL_DEPOSIT_INVALID);
    IERC20(WFTM).transferFrom(msg.sender, address(this), _amount);

    // Deposit WFTM to Yearn Vault and receive yvWFTM
    uint256 assetAmount = IYearnVault(YVWFTM).deposit(_amount, msg.sender);

    // Make lendingPool to transfer required amount
    IERC20(YVWFTM).approve(address(_addressesProvider.getLendingPool()), assetAmount);
    return (YVWFTM, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of yvWFTM based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (_addressesProvider.getAddress('YVWFTM'), _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with yvWFTM and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override {
    address YVWFTM = _addressesProvider.getAddress('YVWFTM');

    // Withdraw from Yearn Vault and receive WFTM
    require(_asset == YVWFTM, Errors.VT_COLLATORAL_WITHDRAW_INVALID);
    uint256 assetAmount = IYearnVault(YVWFTM).withdraw(_amount, address(this), 1);

    // Deliver WFTM to user
    IERC20(_addressesProvider.getAddress('WFTM')).transfer(_to, assetAmount);
  }
}
