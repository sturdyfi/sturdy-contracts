// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {ConvexCurveLPVault} from './ConvexCurveLPVault.sol';
import {ICurveSwap} from '../../../../interfaces/ICurveSwap.sol';

/**
 * @title ConvexFRAX3CRVVault
 * @notice Curve FRAX pool Vault by using Convex on Ethereum
 * @author Sturdy
 **/
contract ConvexFRAX3CRVVault is ConvexCurveLPVault {
  address internal curve3PoolSwap;
  mapping(address => uint256) internal poolCoins;

  function setCurve3PoolSwap(address _address) external onlyAdmin {
    curve3PoolSwap = _address;
    poolCoins[ICurveSwap(_address).coins(0)] = 0;
    poolCoins[ICurveSwap(_address).coins(1)] = 1;
    poolCoins[ICurveSwap(_address).coins(2)] = 2;
  }
}
