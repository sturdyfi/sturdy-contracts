// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {ConvexCurveLPVault} from './ConvexCurveLPVault.sol';

/**
 * @title ConvexSTETHVault
 * @notice Curve steth pool Vault by using Convex on Ethereum
 * @author Sturdy
 **/
contract ConvexSTETHVault is ConvexCurveLPVault {
  address internal curveStableSwap;

  /**
   * @dev The function to set stableswap for lp token
   */
  function setCurveStableSwap(address _address) external onlyAdmin {
    curveStableSwap = _address;
  }
}
