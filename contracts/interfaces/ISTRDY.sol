// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {IERC20} from '../dependencies/openzeppelin/contracts/IERC20.sol';

interface ISTRDY is IERC20 {
  function setRoleCapability(uint8 role, bytes4 functionSig, bool enabled) external;

  function setUserRole(address user, uint8 role, bool enabled) external;
}
