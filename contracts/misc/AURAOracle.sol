// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma abicoder v2;

import './interfaces/IOracle.sol';
import {Variable, IBalancerWeightedPool} from '../interfaces/IBalancerWeightedPool.sol';

/**
 * @dev Oracle contract for AURA Token
 */
contract AURAOracle is IOracle {
  uint256 private constant secs = 3600;
  uint256 private constant ago = 30;

  IBalancerWeightedPool private constant AURA_WETH =
    IBalancerWeightedPool(0xc29562b045D80fD77c69Bec09541F5c16fe20d9d);

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    uint256 _price;
    (, , , , , , uint256 timestamp) = AURA_WETH.getSample(1023);

    if (timestamp != 0) {
      IBalancerWeightedPool.OracleAverageQuery[]
        memory queries = new IBalancerWeightedPool.OracleAverageQuery[](1);

      queries[0].variable = Variable.PAIR_PRICE;
      queries[0].secs = secs;
      queries[0].ago = ago;

      uint256[] memory results = AURA_WETH.getTimeWeightedAverage(queries);
      _price = results[0];
    } else {
      _price = AURA_WETH.getLatest(Variable.PAIR_PRICE);
    }

    return _price;
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
}
