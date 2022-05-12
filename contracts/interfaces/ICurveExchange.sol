// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

interface ICurveExchange {
  function exchange(
    address _pool,
    address _from,
    address _to,
    uint256 _amount,
    uint256 _expected,
    address _receiver
  ) external payable returns (uint256);
}
