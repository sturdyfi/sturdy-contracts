// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma abicoder v2;

import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../interfaces/ICurvePool.sol';
import {Math} from '../dependencies/openzeppelin/contracts/Math.sol';

/**
 * @dev Oracle contract for MIM2CRV(MIM/fUSDT/USDC) LP Token
 */
contract MIM2CRVOracle is IOracle {
  ICurvePool private constant MIM2CRV = ICurvePool(0x2dd7C9371965472E5A5fD28fbE165007c61439E1);

  IChainlinkAggregator private constant USDC =
    IChainlinkAggregator(0x2553f4eeb82d5A26427b8d1106C51499CBa5D99c);
  IChainlinkAggregator private constant fUSDT =
    IChainlinkAggregator(0xF64b636c5dFe1d3555A847341cDC449f612307d0);
  IChainlinkAggregator private constant MIM =
    IChainlinkAggregator(0x28de48D3291F31F839274B8d82691c77DF1c5ceD);

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    (, int256 usdcPrice, , , ) = USDC.latestRoundData();
    (, int256 usdtPrice, , , ) = fUSDT.latestRoundData();
    (, int256 mimPrice, , , ) = MIM.latestRoundData();
    uint256 minStable = Math.min(
      uint256(usdcPrice),
      Math.min(uint256(usdtPrice), uint256(mimPrice))
    );

    return (MIM2CRV.get_virtual_price() * minStable) / 1e18;
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
