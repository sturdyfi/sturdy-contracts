// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

/**
 * @title ICurveAddressProvider interface
 * @notice Interface for the Curve Address Provider.
 **/

interface ICurveAddressProvider {
  function get_address(uint256 id) external view returns (address);
}
