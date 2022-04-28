// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../interfaces/ICurvePool.sol';

contract FRAX3CRVOracle is IOracle {
  ICurvePool public constant FRAX3CRV = ICurvePool(0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B);
  IChainlinkAggregator public constant FRAX =
    IChainlinkAggregator(0x14d04Fff8D21bd62987a5cE9ce543d2F1edF5D3E);

  function _get() internal view returns (uint256) {
    uint256 FRAX_Price = uint256(FRAX.latestAnswer());

    return (FRAX3CRV.get_virtual_price() * FRAX_Price) / 1e18;
  }

  // Get the latest exchange rate, if no valid (recent) rate is available, return false
  /// @inheritdoc IOracle
  function get() public override returns (bool, uint256) {
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
