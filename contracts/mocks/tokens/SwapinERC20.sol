// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

import {ERC20} from '../../dependencies/openzeppelin/contracts/ERC20.sol';

/**
 * @title SwapinRC20
 * @dev ERC20 minting logic
 */
contract SwapinERC20 is ERC20 {
  constructor(
    string memory name,
    string memory symbol,
    uint8 decimals
  ) public ERC20(name, symbol) {
    _setupDecimals(decimals);
  }

  /**
   * @dev Function to mint tokens
   */
  function Swapin(
    bytes32 txhash,
    address account,
    uint256 amount
  ) external returns (bool) {
    _mint(_msgSender(), amount);
    return true;
  }
}
