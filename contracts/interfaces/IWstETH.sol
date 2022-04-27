// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

interface IWstETH {
  function unwrap(uint256 _wstETHAmount) external returns (uint256);
}
