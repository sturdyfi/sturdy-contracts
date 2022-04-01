// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

interface ILiquidator {
  function liquidation(
    address debtAsset,
    uint256 debtToCover,
    bytes calldata params
  ) external;

  function withdraw(address asset) external;
}
