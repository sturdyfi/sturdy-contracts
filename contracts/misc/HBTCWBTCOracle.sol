// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../interfaces/ICurvePool.sol';
import {Math} from '../dependencies/openzeppelin/contracts/Math.sol';

/**
 * @dev Oracle contract for Curve.fi hBTC/wBTC (hCRV) LP Token
 */
contract HBTCWBTCOracle is IOracle {
  ICurvePool private constant HBTCWBTC = ICurvePool(0x4CA9b3063Ec5866A4B82E437059D2C43d1be596F);

  // BTC / ETH
  IChainlinkAggregator private constant BTC =
    IChainlinkAggregator(0xdeb288F737066589598e9214E782fa5A8eD689e8);
  // WBTC / BTC
  IChainlinkAggregator private constant WBTC =
    IChainlinkAggregator(0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23);

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    (, int256 btcPrice, , , ) = BTC.latestRoundData();
    (, int256 wbtc2btcPrice, , , ) = WBTC.latestRoundData();
    uint8 decimals = WBTC.decimals();

    // HBTC maintains a strict, asset-backed 1:1 peg to BTC
    uint256 minValue = uint256(btcPrice);
    if (uint256(wbtc2btcPrice) < 10**decimals) {
      minValue = (minValue * uint256(wbtc2btcPrice)) / (10**decimals);
    }
    uint256 virtualPrice = HBTCWBTC.get_virtual_price();

    return (virtualPrice * minValue) / 1e18;
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
