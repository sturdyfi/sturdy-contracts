// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {GeneralVault} from '../../GeneralVault.sol';
import {IERC20} from '../../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {SafeERC20} from '../../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {IERC20Detailed} from '../../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IConvexBooster} from '../../../../interfaces/IConvexBooster.sol';
import {IConvexBaseRewardPool} from '../../../../interfaces/IConvexBaseRewardPool.sol';
import {TransferHelper} from '../../../libraries/helpers/TransferHelper.sol';
import {Errors} from '../../../libraries/helpers/Errors.sol';
import {SturdyInternalAsset} from '../../../tokenization/SturdyInternalAsset.sol';

/**
 * @title ConvexCurveLPVault
 * @notice Curve LP Token Vault by using Convex on Ethereum
 * @author Sturdy
 **/
contract ConvexCurveLPVault is GeneralVault {
  using SafeERC20 for IERC20;

  address public convexBooster;
  address internal curveLPToken;
  address internal internalAssetToken;
  uint256 internal convexPoolId;

  /**
   * @dev The function to set parameters related to convex/curve
   * @param _lpToken The address of Curve LP Token which will be used in vault
   * @param _poolId  The convex pool Id for Curve LP Token
   */
  function setConfiguration(address _lpToken, uint256 _poolId) external onlyAdmin {
    require(internalAssetToken == address(0), Errors.VT_INVALID_CONFIGURATION);

    convexBooster = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;
    curveLPToken = _lpToken;
    convexPoolId = _poolId;
    SturdyInternalAsset _interalToken = new SturdyInternalAsset(
      string(abi.encodePacked('Sturdy ', IERC20Detailed(_lpToken).symbol())),
      string(abi.encodePacked('c', IERC20Detailed(_lpToken).symbol())),
      IERC20Detailed(_lpToken).decimals()
    );
    internalAssetToken = address(_interalToken);
  }

  /**
   * @dev The function to get internal asset address
   */
  function getInternalAsset() external view returns (address) {
    return internalAssetToken;
  }

  /**
   * @dev The function to get rewards token address
   */
  function getCrvRewards() internal view returns (address) {
    IConvexBooster.PoolInfo memory poolInfo = IConvexBooster(convexBooster).poolInfo(convexPoolId);
    return poolInfo.crvRewards;
  }

  function processYield() external override onlyAdmin {
    address CRV = _addressesProvider.getAddress('CRV');
    address crvRewards = getCrvRewards();

    IConvexBaseRewardPool(crvRewards).getReward();
    uint256 yieldCRV = IERC20(CRV).balanceOf(address(this));

    if (_vaultFee > 0) {
      uint256 treasuryCRV = _processTreasury(yieldCRV);
      yieldCRV = yieldCRV.sub(treasuryCRV);
    }

    // transfer CRV to yieldManager
    address yieldManager = _addressesProvider.getAddress('YIELD_MANAGER');
    TransferHelper.safeTransfer(CRV, yieldManager, yieldCRV);

    emit ProcessYield(CRV, yieldCRV);
  }

  /**
   * @dev Get yield amount based on strategy
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(internalAssetToken);
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    uint256 decimals = IERC20Detailed(internalAssetToken).decimals();
    return 10**decimals;
  }

  /**
   * @dev Deposit to yield pool based on strategy and mint internal asset
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    // receive Curve LP Token from user
    require(_asset == curveLPToken, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    TransferHelper.safeTransferFrom(curveLPToken, msg.sender, address(this), _amount);

    // Deposit Curve LP Token to Convex
    IERC20(curveLPToken).safeApprove(convexBooster, _amount);
    IConvexBooster(convexBooster).deposit(convexPoolId, _amount, true);

    // mint
    SturdyInternalAsset(internalAssetToken).mint(address(this), _amount);
    IERC20(internalAssetToken).safeApprove(address(_addressesProvider.getLendingPool()), _amount);

    return (internalAssetToken, _amount);
  }

  /**
   * @dev Get Withdrawal amount of Curve LP Token based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (internalAssetToken, _amount);
  }

  function _withdraw(uint256 _amount, address _to) internal returns (uint256) {
    address crvRewards = getCrvRewards();

    // Get Reward before withdraw
    IConvexBaseRewardPool(crvRewards).getReward();

    // Withdraw from Convex
    IConvexBaseRewardPool(crvRewards).withdrawAndUnwrap(_amount, true);

    // Deliver Curve LP Token
    TransferHelper.safeTransfer(curveLPToken, _to, _amount);

    // Burn
    SturdyInternalAsset(internalAssetToken).burn(address(this), _amount);

    return _amount;
  }

  function withdrawOnLiquidation(address _asset, uint256 _amount)
    external
    override
    returns (uint256)
  {
    require(_asset == curveLPToken, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == _addressesProvider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    return _withdraw(_amount, msg.sender);
  }

  /**
   * @dev Withdraw from yield pool based on strategy and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override returns (uint256) {
    require(_asset == curveLPToken, Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    return _withdraw(_amount, _to);
  }

  /**
   * @dev Move some yield(CRV) to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('CRV')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
