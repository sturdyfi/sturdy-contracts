// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface ICurvePoolAdmin {
  function withdraw_admin_fees(address pool) external;
}
