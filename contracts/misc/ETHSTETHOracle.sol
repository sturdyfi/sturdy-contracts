// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma abicoder v2;

import './interfaces/IOracle.sol';
import './interfaces/IOracleValidate.sol';
import '../interfaces/ICurvePool.sol';
import '../interfaces/ICurvePoolAdmin.sol';

/**
 * @dev Oracle contract for ETHSTETH LP Token
 */
contract ETHSTETHOracle is IOracle, IOracleValidate {
  ICurvePool private constant ETHSTETH = ICurvePool(0xDC24316b9AE028F1497c275EB9192a3Ea0f67022);
  ICurvePoolAdmin private constant ADMIN =
    ICurvePoolAdmin(0xeCb456EA5365865EbAb8a2661B0c503410e9B347);

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    return ETHSTETH.get_virtual_price();
  }

  // Get the latest exchange rate, if no valid (recent) rate is available, return false
  /// @inheritdoc IOracle
  function get() public view override returns (bool, uint256) {
    return (true, _get());
  }

  // Check the last exchange rate without any state changes
  /// @inheritdoc IOracle
  function peek() public view override returns (bool, int256) {
    return (true, int256(_get()));
  }

  // Check the current spot exchange rate without any state changes
  /// @inheritdoc IOracle
  function latestAnswer() external view override returns (int256 rate) {
    return int256(_get());
  }

  // Check the oracle (re-entrancy)
  /// @inheritdoc IOracleValidate
  function check() external {
    ADMIN.withdraw_admin_fees(address(ETHSTETH));
  }
}
