// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import '../../../dependencies/openzeppelin/contracts/ERC4626.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {ILendingPool} from '../../../interfaces/ILendingPool.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {DataTypes} from '../../../protocol/libraries/types/DataTypes.sol';
import {ReserveConfiguration} from '../../../protocol/libraries/configuration/ReserveConfiguration.sol';

/**
 * @title ERC4626Vault
 * @notice Basic ERC4626 vault
 * @author Sturdy
 */

contract ERC4626Vault is ERC4626 {
  using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

  /// @notice The Sturdy sToken contract
  IERC20Detailed public immutable aToken;

  /// @notice The Sturdy LendingPool contract
  ILendingPool public immutable lendingPool;

  constructor(
    IERC20Detailed asset_,
    IERC20Detailed aToken_,
    ILendingPool lendingPool_
  ) ERC4626(asset_) ERC20(_vaultName(asset_), _vaultSymbol(asset_)) {
    aToken = aToken_;
    lendingPool = lendingPool_;
    _setupDecimals(asset_.decimals());
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
}
