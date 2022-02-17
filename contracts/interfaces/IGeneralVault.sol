// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

interface IGeneralVault {
  function pricePerShare() external view returns (uint256);

  function withdrawOnLiquidation(address _asset, uint256 _amount) external returns (uint256);

  function processYield() external;

  function getYieldAmount() external view returns (uint256);
}
