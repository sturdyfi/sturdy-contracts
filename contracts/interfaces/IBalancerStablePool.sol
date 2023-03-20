// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IBalancerStablePool {
  function getRate() external view returns (uint256);

  function getWrappedTokenRate() external view returns (uint256);
}
