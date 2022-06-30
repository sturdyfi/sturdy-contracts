// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface CTokenInterface {
  function exchangeRateStored() external view returns (uint256);
}
