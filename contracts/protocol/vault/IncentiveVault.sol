// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {GeneralVault} from './GeneralVault.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {VariableYieldDistribution} from '../../incentives/VariableYieldDistribution.sol';

/**
 * @title GeneralVault
 * @notice Basic feature of vault
 * @author Sturdy
 **/

abstract contract IncentiveVault is GeneralVault {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  event SetIncentiveRatio(uint256 ratio);

  uint256 public _incentiveRatio;

  /**
   * @dev Get the incentive token address supported on this vault
   */
  function getIncentiveToken() public view virtual returns (address);

  /**
   * @dev Get current total incentive amount
   */
  function getCurrentTotalIncentiveAmount() external view virtual returns (uint256);

  /**
   * @dev Get AToken address for the vault
   */
  function getAToken() internal view virtual returns (address);

  /**
   * @dev Set Incentive Ratio
   */
  function setIncentiveRatio(uint256 _ratio) external onlyAdmin {
    require(_vaultFee + _ratio <= PercentageMath.PERCENTAGE_FACTOR, Errors.VT_FEE_TOO_BIG);

    // Get all available rewards & Send it to YieldDistributor,
    // so that the changing ratio does not affect asset's cumulative index
    if (_incentiveRatio != 0) {
      clearRewards();
    }

    _incentiveRatio = _ratio;

    emit SetIncentiveRatio(_ratio);
  }

  function clearRewards() internal virtual;

  /**
   * @dev Send incentive to YieldDistribution
   */
  function sendIncentive(uint256 amount) internal {
    address rewardToken = getIncentiveToken();
    address asset = getAToken();
    // transfer to yieldManager
    address yieldDistributor = _addressesProvider.getAddress('VR_YIELD_DISTRIBUTOR');
    IERC20(rewardToken).safeTransfer(yieldDistributor, amount);

    VariableYieldDistribution(yieldDistributor).receivedRewards(asset, rewardToken, amount);
  }
}
