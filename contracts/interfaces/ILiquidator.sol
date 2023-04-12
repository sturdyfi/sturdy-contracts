// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface ILiquidator {
  function liquidation(address debtAsset, uint256 debtToCover, bytes calldata params) external;

  function withdraw(address asset) external;
}
