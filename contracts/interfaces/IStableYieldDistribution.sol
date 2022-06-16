// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

interface IStableYieldDistribution {
  function claimRewards(
    address[] calldata assets,
    uint256 amount,
    address to
  ) external returns (uint256);

  function getRewardsBalance(address[] calldata assets, address user)
    external
    view
    returns (uint256);
}
