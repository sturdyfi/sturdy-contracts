// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../interfaces/ICurvePool.sol';
import {Math} from '../dependencies/openzeppelin/contracts/Math.sol';

/**
 * @dev Oracle contract for MIM3CRV LP Token
 */
contract MIM3CRVOracle is IOracle {
  ICurvePool private constant MIM3CRV = ICurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
  ICurvePool private constant CRV3 = ICurvePool(0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7);

  IChainlinkAggregator private constant DAI =
    IChainlinkAggregator(0x773616E4d11A78F511299002da57A0a94577F1f4);
  IChainlinkAggregator private constant USDC =
    IChainlinkAggregator(0x986b5E1e1755e3C2440e960477f25201B0a8bbD4);
  IChainlinkAggregator private constant USDT =
    IChainlinkAggregator(0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46);
  IChainlinkAggregator private constant MIM =
    IChainlinkAggregator(0x7A364e8770418566e3eb2001A96116E6138Eb32F);

  /**
   * @dev Get price for 3Pool LP Token
   */
  function _get3CRVPrice() internal view returns (uint256) {
    (, int256 daiPrice, , , ) = DAI.latestRoundData();
    (, int256 usdcPrice, , , ) = USDC.latestRoundData();
    (, int256 usdtPrice, , , ) = USDT.latestRoundData();
    uint256 minStable = Math.min(
      uint256(daiPrice),
      Math.min(uint256(usdcPrice), uint256(usdtPrice))
    );
    return (CRV3.get_virtual_price() * minStable) / 1e18;
  }

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    uint256 lp3crvPrice = _get3CRVPrice();
    (, int256 mimPrice, , , ) = MIM.latestRoundData();
    uint256 minValue = Math.min(uint256(mimPrice), lp3crvPrice);

    return (MIM3CRV.get_virtual_price() * minValue) / 1e18;
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
