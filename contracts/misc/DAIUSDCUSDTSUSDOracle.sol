// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../interfaces/ICurvePool.sol';
import {Math} from '../dependencies/openzeppelin/contracts/Math.sol';

/**
 * @dev Oracle contract for DAIUSDCUSDTSUSD LP Token
 */
contract DAIUSDCUSDTSUSDOracle is IOracle {
  ICurvePool private constant DAIUSDCUSDTSUSD =
    ICurvePool(0xA5407eAE9Ba41422680e2e00537571bcC53efBfD);

  IChainlinkAggregator private constant DAI =
    IChainlinkAggregator(0x773616E4d11A78F511299002da57A0a94577F1f4);
  IChainlinkAggregator private constant USDC =
    IChainlinkAggregator(0x986b5E1e1755e3C2440e960477f25201B0a8bbD4);
  IChainlinkAggregator private constant USDT =
    IChainlinkAggregator(0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46);
  IChainlinkAggregator private constant SUSD =
    IChainlinkAggregator(0x8e0b7e6062272B5eF4524250bFFF8e5Bd3497757);

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    (, int256 daiPrice, , , ) = DAI.latestRoundData();
    (, int256 usdcPrice, , , ) = USDC.latestRoundData();
    (, int256 usdtPrice, , , ) = USDT.latestRoundData();
    (, int256 sUsdPrice, , , ) = SUSD.latestRoundData();
    uint256 minValue = Math.min(
      Math.min(uint256(daiPrice), uint256(usdcPrice)),
      Math.min(uint256(usdtPrice), uint256(sUsdPrice))
    );

    return (DAIUSDCUSDTSUSD.get_virtual_price() * minValue) / 1e18;
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
