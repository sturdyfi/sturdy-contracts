// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IYearnFinanceVault {
  function deposit(uint256 _amount, address recipient) external returns (uint256);

  function withdraw(
    uint256 maxShares,
    address recipient,
    uint256 maxLoss
  ) external returns (uint256);

  function pricePerShare() external view returns (uint256);
}
