// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma abicoder v2;

import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';

/**
 * @dev Oracle contract for MIM Token
 */
contract MIMOracle is IOracle {
  IChainlinkAggregator private constant MIM =
    IChainlinkAggregator(0x7A364e8770418566e3eb2001A96116E6138Eb32F);
  IChainlinkAggregator private constant ETH =
    IChainlinkAggregator(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);

  /**
   * @dev Get Token Price
   */
  function _get() internal view returns (uint256) {
    (, int256 mimPrice, , , ) = MIM.latestRoundData();
    (, int256 ethPrice, , , ) = ETH.latestRoundData();

    return (uint256(mimPrice) * 1e18) / uint256(ethPrice);
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
