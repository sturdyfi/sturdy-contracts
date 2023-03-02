// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import '../../../interfaces/IERC4626Router.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {Ownable} from '../../../dependencies/openzeppelin/contracts/Ownable.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';

/**
 * @title ERC4626Router
 * @notice ERC4626 router
 * @author Sturdy
 */

contract ERC4626Router is IERC4626Router, Ownable {
  constructor() {}

  function authorizeVault(address vault) external onlyOwner {
    IERC20(IERC4626(vault).asset()).approve(vault, type(uint256).max);
  }

  /// @inheritdoc IERC4626Router
  function mint(
    IERC4626 vault,
    address to,
    uint256 shares,
    uint256 maxAmountIn
  ) public override returns (uint256 amountIn) {
    amountIn = vault.previewMint(shares);
    require(amountIn <= maxAmountIn, Errors.VT_INVALID_CONFIGURATION);

    SafeERC20.safeTransferFrom(
      IERC20(IERC4626(vault).asset()),
      msg.sender,
      address(this),
      amountIn
    );
    vault.mint(shares, to);
  }

  /// @inheritdoc IERC4626Router
  function deposit(
    IERC4626 vault,
    address to,
    uint256 amount,
    uint256 minSharesOut
  ) public override returns (uint256 sharesOut) {
    SafeERC20.safeTransferFrom(IERC20(IERC4626(vault).asset()), msg.sender, address(this), amount);
    require(
      (sharesOut = vault.deposit(amount, to)) >= minSharesOut,
      Errors.VT_INVALID_CONFIGURATION
    );
  }

  /// @inheritdoc IERC4626Router
  function withdraw(
    IERC4626 vault,
    address to,
    uint256 amount,
    uint256 maxSharesOut
  ) public override returns (uint256 sharesOut) {
    require(
      (sharesOut = vault.withdraw(amount, to, msg.sender)) <= maxSharesOut,
      Errors.VT_INVALID_CONFIGURATION
    );
  }

  /// @inheritdoc IERC4626Router
  function redeem(
    IERC4626 vault,
    address to,
    uint256 shares,
    uint256 minAmountOut
  ) public override returns (uint256 amountOut) {
    require(
      (amountOut = vault.redeem(shares, to, msg.sender)) >= minAmountOut,
      Errors.VT_INVALID_CONFIGURATION
    );
  }
}
