// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {ERC20} from '../dependencies/openzeppelin/contracts/ERC20.sol';
import {VersionedInitializable} from '../protocol/libraries/aave-upgradeability/VersionedInitializable.sol';

/**
 * @notice implementation of the BRICK token contract
 * @author Sturdy
 */
contract SturdyToken is ERC20, VersionedInitializable {
  string internal constant NAME = 'Sturdy Token';
  string internal constant SYMBOL = 'BRICK';
  uint8 internal constant DECIMALS = 18;

  /// @dev the amount being distributed for supplier and borrower
  uint256 internal constant DISTRIBUTION_AMOUNT = 3000000 ether;

  uint256 public constant REVISION = 1;

  /// @dev owner => next valid nonce to submit with permit()
  mapping(address => uint256) public _nonces;

  constructor() public ERC20(NAME, SYMBOL) {}

  /**
   * @dev initializes the contract upon assignment to the InitializableAdminUpgradeabilityProxy
   * @param distributor the address of the BRICK distribution contract
   */
  function initialize(address distributor) external initializer {
    _setupDecimals(DECIMALS);
    _mint(distributor, DISTRIBUTION_AMOUNT);
  }

  /**
   * @dev returns the revision of the implementation contract
   */
  function getRevision() internal pure override returns (uint256) {
    return REVISION;
  }
}
