// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import '../dependencies/openzeppelin/contracts/IERC4626.sol';

/**
 * @title ERC4626Router Interface
 * @notice A canonical router between ERC4626 Vaults https://eips.ethereum.org/EIPS/eip-4626
 * It includes methods for the four mutable ERC4626 functions deposit/mint/withdraw/redeem as well.
 * NOTE the router is capable of pulling any approved token from your wallet.
 * This is only possible when your address is msg.sender, but regardless be careful when interacting with the router or ERC4626 Vaults.
 * The router makes no special considerations for unique ERC20 implementations such as fee on transfer.
 * There are no built in protections for unexpected behavior beyond enforcing the minSharesOut is received.
 */
interface IERC4626Router {
  /************************** Mint **************************/

  /**
   * @notice mint `shares` from an ERC4626 vault.
   * @param vault The ERC4626 vault to mint shares from.
   * @param to The destination of ownership shares.
   * @param shares The amount of shares to mint from `vault`.
   * @param maxAmountIn The max amount of assets used to mint.
   * @return amountIn the amount of assets used to mint by `to`.
   */
  function mint(
    IERC4626 vault,
    address to,
    uint256 shares,
    uint256 maxAmountIn
  ) external returns (uint256 amountIn);

  /************************** Deposit **************************/

  /**
   * @notice deposit `amount` to an ERC4626 vault.
   * @param vault The ERC4626 vault to deposit assets to.
   * @param to The destination of ownership shares.
   * @param amount The amount of assets to deposit to `vault`.
   * @param minSharesOut The min amount of `vault` shares received by `to`.
   * @return sharesOut the amount of shares received by `to`.
   */
  function deposit(
    IERC4626 vault,
    address to,
    uint256 amount,
    uint256 minSharesOut
  ) external returns (uint256 sharesOut);

  /************************** Withdraw **************************/

  /**
   * @notice withdraw `amount` from an ERC4626 vault.
   * @param vault The ERC4626 vault to withdraw assets from.
   * @param to The destination of assets.
   * @param amount The amount of assets to withdraw from vault.
   * @param minSharesOut The min amount of shares received by `to`.
   * @return sharesOut the amount of shares received by `to`.
   */
  function withdraw(
    IERC4626 vault,
    address to,
    uint256 amount,
    uint256 minSharesOut
  ) external returns (uint256 sharesOut);

  /************************** Redeem **************************/

  /**
   * @notice redeem `shares` shares from an ERC4626 vault.
   * @param vault The ERC4626 vault to redeem shares from.
   * @param to The destination of assets.
   * @param shares The amount of shares to redeem from vault.
   * @param minAmountOut The min amount of assets received by `to`.
   * @return amountOut the amount of assets received by `to`.
   */
  function redeem(
    IERC4626 vault,
    address to,
    uint256 shares,
    uint256 minAmountOut
  ) external returns (uint256 amountOut);
}
