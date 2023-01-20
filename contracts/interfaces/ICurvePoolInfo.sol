// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

/**
 * @title ICurvePoolInfo
 * @author Sturdy
 * @notice Curve Pool Info
 **/
interface ICurvePoolInfo {
  struct PoolParams {
    uint256 A;
    uint256 future_A;
    uint256 fee;
    uint256 admin_fee;
    uint256 future_fee;
    uint256 future_admin_fee;
    address future_owner;
    uint256 initial_A;
    uint256 initial_A_time;
    uint256 future_A_time;
  }

  struct PoolInfo {
    uint256[8] balances;
    uint256[8] underlying_balances;
    uint256[8] decimals;
    uint256[8] underlying_decimals;
    uint256[8] rates;
    address lp_token;
    PoolParams params;
  }

  function get_pool_info(address _pool) external view returns (PoolInfo memory);
}
