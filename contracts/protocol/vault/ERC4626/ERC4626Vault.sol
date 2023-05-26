// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../../../dependencies/openzeppelin/contracts/ERC4626.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {ILendingPool} from '../../../interfaces/ILendingPool.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {DataTypes} from '../../../protocol/libraries/types/DataTypes.sol';
import {ReserveConfiguration} from '../../../protocol/libraries/configuration/ReserveConfiguration.sol';
import {ISturdyIncentivesController} from '../../../interfaces/ISturdyIncentivesController.sol';

/**
 * @title ERC4626Vault
 * @notice Basic ERC4626 vault
 * @author Sturdy
 */

contract ERC4626Vault is ERC4626 {
  using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
  using SafeERC20 for IERC20;

  struct AssetData {
    uint104 index;
    uint40 lastUpdateTimestamp;
  }

  uint8 private constant _PRECISION = 27;

  /// @notice The Sturdy IncentiveController contract
  ISturdyIncentivesController public immutable incentiveController;

  /// @notice The Sturdy sToken contract
  IERC20Detailed public immutable aToken;

  /// @notice The Sturdy LendingPool contract
  ILendingPool public immutable lendingPool;

  /// @notice The user's accrued incentive amount
  mapping(address => uint256) internal _usersUnclaimedRewards;

  /// @notice The incentive reward data of the Sturdy sToken
  AssetData internal _assetData;

  /// @notice The incentive reward data of the users
  mapping(address => uint256) internal _usersData;

  event RewardsAccrued(address indexed user, uint256 amount);
  event RewardsClaimed(address indexed user, address indexed to, uint256 amount);
  event AssetIndexUpdated(uint256 index);
  event UserIndexUpdated(address indexed user, uint256 index);

  constructor(
    IERC20Detailed asset_,
    IERC20Detailed aToken_,
    ILendingPool lendingPool_,
    ISturdyIncentivesController incentiveController_
  ) ERC4626(asset_) ERC20(_vaultName(asset_), _vaultSymbol(asset_)) {
    aToken = aToken_;
    lendingPool = lendingPool_;
    incentiveController = incentiveController_;
    _setupDecimals(asset_.decimals());
  }

  /// -----------------------------------------------------------------------
  /// Incentive Distribution
  /// -----------------------------------------------------------------------

  /**
   * @dev Returns the total of rewards of an user, already accrued + not yet accrued
   * @param user The address of the user
   * @return The rewards
   **/
  function getRewardsBalance(address user) external view returns (uint256) {
    uint256 unclaimedRewards = _usersUnclaimedRewards[user];
    unclaimedRewards += _getUnclaimedRewards(user);
    return unclaimedRewards;
  }

  /**
   * @dev Claims reward for an user, on all the assets of the lending pool, accumulating the pending rewards
   * @param amount Amount of rewards to claim
   * @param to Address that will be receiving the rewards
   * @return Rewards claimed
   **/
  function claimRewards(uint256 amount, address to) external returns (uint256) {
    require(to != address(0), Errors.YD_INVALID_CONFIGURATION);
    return _claimRewards(amount, msg.sender, to);
  }

  /**
   * @dev returns the reward data of the user
   * @param user the address of the user
   * @return the user index for the asset
   */
  function getUserAssetData(address user) external view returns (uint256) {
    return _usersData[user];
  }

  function REWARD_TOKEN() external view returns (address) {
    return incentiveController.REWARD_TOKEN();
  }

  function DISTRIBUTION_END() external view returns (uint256) {
    return incentiveController.DISTRIBUTION_END();
  }

  /**
   * @dev Returns the configuration of the distribution
   * @return The asset index, and the last updated timestamp
   */
  function getAssetData() external view returns (uint256, uint256) {
    return (_assetData.index, _assetData.lastUpdateTimestamp);
  }

  function PRECISION() external pure returns (uint8) {
    return _PRECISION;
  }

  /**
   * @dev Called by the aToken balance changes that affects the rewards distribution
   * @param user The address of the user
   * @param stakedByUser The old amount of tokens staked by the user
   * @param totalStaked The old total tokens staked by this contract
   **/
  function _handleAction(address user, uint256 totalStaked, uint256 stakedByUser) internal {
    (, uint256 emissionPerSecond, ) = incentiveController.getAssetData(address(aToken));
    if (emissionPerSecond == 0) return;

    uint256 accruedRewards = _updateUserAssetInternal(user, stakedByUser, totalStaked);
    if (accruedRewards != 0) {
      _usersUnclaimedRewards[user] += accruedRewards;
      emit RewardsAccrued(user, accruedRewards);
    }
  }

  /**
   * @dev Updates the state of an user in a distribution
   * @param user The user's address
   * @param stakedByUser Amount of tokens staked by the user in the distribution at the moment
   * @param totalStaked Total tokens staked in the distribution
   * @return The accrued rewards for the user until the moment
   **/
  function _updateUserAssetInternal(
    address user,
    uint256 stakedByUser,
    uint256 totalStaked
  ) internal returns (uint256) {
    uint256 userIndex = _usersData[user];
    uint256 accruedRewards;

    uint256 newIndex = _updateAssetStateInternal(totalStaked);

    if (userIndex == newIndex) return accruedRewards;

    if (stakedByUser != 0) {
      accruedRewards = _getRewards(stakedByUser, newIndex, userIndex);
    }

    _usersData[user] = newIndex;
    emit UserIndexUpdated(user, newIndex);

    return accruedRewards;
  }

  /**
   * @dev Updates the state of one distribution, mainly rewards index and timestamp
   * @param totalStaked Current total of staked assets for this distribution
   * @return The new distribution index
   **/
  function _updateAssetStateInternal(uint256 totalStaked) internal returns (uint256) {
    uint256 oldIndex = _assetData.index;
    (, uint256 emissionPerSecond, ) = incentiveController.getAssetData(address(aToken));
    uint128 lastUpdateTimestamp = _assetData.lastUpdateTimestamp;

    if (block.timestamp == lastUpdateTimestamp) {
      return oldIndex;
    }

    uint256 newIndex = _getAssetIndex(
      oldIndex,
      emissionPerSecond,
      lastUpdateTimestamp,
      totalStaked
    );

    if (newIndex == oldIndex) {
      _assetData.lastUpdateTimestamp = uint40(block.timestamp);
    } else {
      require(uint104(newIndex) == newIndex, 'Index overflow');
      //optimization: storing one after another saves one SSTORE
      _assetData.index = uint104(newIndex);
      _assetData.lastUpdateTimestamp = uint40(block.timestamp);
      emit AssetIndexUpdated(newIndex);
    }

    return newIndex;
  }

  /**
   * @dev Return the accrued rewards for an user
   * @param user The address of the user
   * @return The accrued rewards for the user until the moment
   **/
  function _getUnclaimedRewards(address user) internal view returns (uint256) {
    (, uint256 emissionPerSecond, ) = incentiveController.getAssetData(address(aToken));
    uint256 assetIndex = _getAssetIndex(
      _assetData.index,
      emissionPerSecond,
      _assetData.lastUpdateTimestamp,
      totalSupply()
    );

    return _getRewards(balanceOf(user), assetIndex, _usersData[user]);
  }

  /**
   * @dev Calculates the next value of an specific distribution index, with validations
   * @param currentIndex Current index of the distribution
   * @param emissionPerSecond Representing the total rewards distributed per second per asset unit, on the distribution
   * @param lastUpdateTimestamp Last moment this distribution was updated
   * @param totalBalance of tokens considered for the distribution
   * @return The new index.
   **/
  function _getAssetIndex(
    uint256 currentIndex,
    uint256 emissionPerSecond,
    uint128 lastUpdateTimestamp,
    uint256 totalBalance
  ) internal view returns (uint256) {
    uint256 distributionEnd = incentiveController.DISTRIBUTION_END();
    if (
      emissionPerSecond == 0 ||
      totalBalance == 0 ||
      lastUpdateTimestamp == block.timestamp ||
      lastUpdateTimestamp >= distributionEnd
    ) {
      return currentIndex;
    }

    uint256 currentTimestamp = block.timestamp > distributionEnd
      ? distributionEnd
      : block.timestamp;
    uint256 timeDelta = currentTimestamp - lastUpdateTimestamp;
    return
      ((emissionPerSecond * timeDelta * (10 ** uint256(_PRECISION))) / totalBalance) + currentIndex;
  }

  /**
   * @dev Internal function for the calculation of user's rewards on a distribution
   * @param principalUserBalance Amount staked by the user on a distribution
   * @param reserveIndex Current index of the distribution
   * @param userIndex Index stored for the user, representation his staking moment
   * @return The rewards
   **/
  function _getRewards(
    uint256 principalUserBalance,
    uint256 reserveIndex,
    uint256 userIndex
  ) internal pure returns (uint256) {
    return (principalUserBalance * (reserveIndex - userIndex)) / 10 ** uint256(_PRECISION);
  }

  /**
   * @dev Claims reward for an user on behalf
   * @param amount Amount of rewards to claim
   * @param user Address to check and claim rewards
   * @param to Address that will be receiving the rewards
   * @return Rewards claimed
   **/
  function _claimRewards(uint256 amount, address user, address to) internal returns (uint256) {
    if (amount == 0) {
      return 0;
    }
    uint256 unclaimedRewards = _usersUnclaimedRewards[user];
    uint256 accruedRewards = _updateUserAssetInternal(user, balanceOf(user), totalSupply());
    if (accruedRewards != 0) {
      unclaimedRewards += accruedRewards;
      emit RewardsAccrued(user, accruedRewards);
    }

    if (unclaimedRewards == 0) {
      return 0;
    }

    uint256 amountToClaim = amount > unclaimedRewards ? unclaimedRewards : amount;
    address REWARD_TOKEN = incentiveController.REWARD_TOKEN();
    address[] memory assets = new address[](1);
    assets[0] = address(aToken);

    if (incentiveController.getRewardsBalance(assets, address(this)) > 0) {
      incentiveController.claimRewards(assets, type(uint256).max, address(this));
    }

    if (IERC20(REWARD_TOKEN).balanceOf(address(this)) >= amountToClaim) {
      _usersUnclaimedRewards[user] = unclaimedRewards - amountToClaim;
      IERC20(REWARD_TOKEN).safeTransfer(to, amountToClaim);

      emit RewardsClaimed(user, to, amountToClaim);
      return amountToClaim;
    }

    return 0;
  }

  /// -----------------------------------------------------------------------
  /// ERC4626 overrides
  /// -----------------------------------------------------------------------
  function totalAssets() public view override returns (uint256) {
    // aTokens use rebasing to accrue interest, so the total assets is just the aToken balance
    return aToken.balanceOf(address(this));
  }

  function maxDeposit(address) public view override returns (uint256) {
    if (!_checkDepositPool()) return 0;

    return type(uint256).max;
  }

  function maxMint(address) public view override returns (uint256) {
    if (!_checkDepositPool()) return 0;

    return type(uint256).max;
  }

  function maxWithdraw(address owner) public view override returns (uint256) {
    if (!_checkWithdrawPool()) return 0;

    uint256 cash = _asset.balanceOf(address(aToken));
    uint256 assetsBalance = convertToAssets(balanceOf(owner));
    return cash < assetsBalance ? cash : assetsBalance;
  }

  function maxRedeem(address owner) public view override returns (uint256) {
    if (!_checkWithdrawPool()) return 0;

    uint256 cash = _asset.balanceOf(address(aToken));
    uint256 cashInShares = convertToShares(cash);
    uint256 shareBalance = balanceOf(owner);
    return cashInShares < shareBalance ? cashInShares : shareBalance;
  }

  function _deposit(
    address caller,
    address receiver,
    uint256 assets,
    uint256 shares
  ) internal override {
    super._deposit(caller, receiver, assets, shares);

    /// Deposit assets into Sturdy
    SafeERC20.safeApprove(_asset, address(lendingPool), assets);
    lendingPool.deposit(address(_asset), assets, address(this), 0);
  }

  function _withdraw(
    address caller,
    address receiver,
    address owner,
    uint256 assets,
    uint256 shares
  ) internal override {
    if (caller != owner) {
      _spendAllowance(owner, caller, shares);
    }

    _burn(owner, shares);

    emit Withdraw(caller, receiver, owner, assets, shares);

    // withdraw assets directly from Sturdy
    lendingPool.withdraw(address(_asset), assets, receiver);
  }

  /**
   * @dev check the pool status before deposit/mint
   */
  function _checkDepositPool() internal view returns (bool) {
    // check if pool is paused
    if (lendingPool.paused()) {
      return false;
    }

    // check if asset is paused
    DataTypes.ReserveConfigurationMap memory configuration = lendingPool.getConfiguration(
      address(_asset)
    );
    (bool isActive, bool isFrozen, , , ) = configuration.getFlagsMemory();

    if (!isActive || isFrozen) {
      return false;
    }

    return true;
  }

  /**
   * @dev check the pool status before withdraw/redeem
   */
  function _checkWithdrawPool() internal view returns (bool) {
    // check if pool is paused
    if (lendingPool.paused()) {
      return false;
    }

    // check if asset is paused
    DataTypes.ReserveConfigurationMap memory configuration = lendingPool.getConfiguration(
      address(_asset)
    );
    (bool isActive, , , , ) = configuration.getFlagsMemory();

    if (!isActive) {
      return false;
    }

    return true;
  }

  /// -----------------------------------------------------------------------
  /// ERC20 metadata generation
  /// -----------------------------------------------------------------------

  function _vaultName(
    IERC20Detailed asset_
  ) internal view virtual returns (string memory vaultName) {
    vaultName = string(abi.encodePacked('ERC4626-Wrapped Sturdy ', asset_.symbol()));
  }

  function _vaultSymbol(
    IERC20Detailed asset_
  ) internal view virtual returns (string memory vaultSymbol) {
    vaultSymbol = string(abi.encodePacked('ws2', asset_.symbol()));
  }

  /// -----------------------------------------------------------------------
  /// ERC20 override
  /// -----------------------------------------------------------------------
  function _transfer(address sender, address recipient, uint256 amount) internal override {
    uint256 oldSenderBalance = balanceOf(sender);
    uint256 oldRecipientBalance = balanceOf(recipient);

    super._transfer(sender, recipient, amount);

    uint256 totalSupply = totalSupply();
    _handleAction(sender, totalSupply, oldSenderBalance);
    if (sender != recipient) {
      _handleAction(recipient, totalSupply, oldRecipientBalance);
    }
  }

  function _mint(address account, uint256 amount) internal override {
    uint256 oldTotalSupply = totalSupply();
    uint256 oldAccountBalance = balanceOf(account);

    super._mint(account, amount);

    _handleAction(account, oldTotalSupply, oldAccountBalance);
  }

  function _burn(address account, uint256 amount) internal override {
    uint256 oldTotalSupply = totalSupply();
    uint256 oldAccountBalance = balanceOf(account);

    super._burn(account, amount);

    _handleAction(account, oldTotalSupply, oldAccountBalance);

    emit Transfer(account, address(0), amount);
  }
}
