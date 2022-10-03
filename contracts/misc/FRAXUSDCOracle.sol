// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma abicoder v2;

import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../interfaces/ICurvePool.sol';
import {Math} from '../dependencies/openzeppelin/contracts/Math.sol';

/**
 * @dev Oracle contract for FRAXUSDC LP Token
 */
contract FRAXUSDCOracle is IOracle {
  ICurvePool private constant FRAXUSDC = ICurvePool(0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2);

  IChainlinkAggregator private constant USDC =
    IChainlinkAggregator(0x986b5E1e1755e3C2440e960477f25201B0a8bbD4);
  IChainlinkAggregator private constant FRAX =
    IChainlinkAggregator(0x14d04Fff8D21bd62987a5cE9ce543d2F1edF5D3E);

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    (, int256 usdcPrice, , , ) = USDC.latestRoundData();
    (, int256 fraxPrice, , , ) = FRAX.latestRoundData();
    uint256 minValue = Math.min(uint256(fraxPrice), uint256(usdcPrice));

    return (FRAXUSDC.get_virtual_price() * minValue) / 1e18;
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
