// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

interface ICurvePool {
  function get_virtual_price() external view returns (uint256 price);
}
