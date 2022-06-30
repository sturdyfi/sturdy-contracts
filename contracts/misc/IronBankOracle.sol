// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../interfaces/CTokenInterface.sol';
import '../interfaces/ICurvePool.sol';
import {Math} from '../dependencies/openzeppelin/contracts/Math.sol';

/**
 * @dev Oracle contract for IronBank LP Token
 */
contract IronBankOracle is IOracle {
  ICurvePool private constant IronBank = ICurvePool(0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF);

  IChainlinkAggregator private constant DAI =
    IChainlinkAggregator(0x773616E4d11A78F511299002da57A0a94577F1f4);
  IChainlinkAggregator private constant USDC =
    IChainlinkAggregator(0x986b5E1e1755e3C2440e960477f25201B0a8bbD4);
  IChainlinkAggregator private constant USDT =
    IChainlinkAggregator(0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46);
  CTokenInterface private constant cyDAI =
    CTokenInterface(0x8e595470Ed749b85C6F7669de83EAe304C2ec68F);
  CTokenInterface private constant cyUSDC =
    CTokenInterface(0x76Eb2FE28b36B3ee97F3Adae0C69606eeDB2A37c);
  CTokenInterface private constant cyUSDT =
    CTokenInterface(0x48759F220ED983dB51fA7A8C0D2AAb8f3ce4166a);

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    (, int256 daiPrice, , , ) = DAI.latestRoundData();
    (, int256 usdcPrice, , , ) = USDC.latestRoundData();
    (, int256 usdtPrice, , , ) = USDT.latestRoundData();

    uint256 minValue = Math.min(
      Math.min(
        // cyDAI Price
        _getPriceOfToken(uint256(daiPrice), cyDAI.exchangeRateStored(), 18, 8),
        // cyUSDC Price
        _getPriceOfToken(uint256(usdcPrice), cyUSDC.exchangeRateStored(), 6, 8)
      ),
      // cyUSDT Price
      _getPriceOfToken(uint256(usdtPrice), cyUSDT.exchangeRateStored(), 6, 8)
    );

    return (IronBank.get_virtual_price() * minValue) / 1e18;
  }

  /**
   * @dev Get cyToken Price
   */
  function _getPriceOfToken(
    uint256 assetPrice,
    uint256 cyAssetRatio,
    uint256 assetDecimal,
    uint256 cyAssetDecimal
  ) private pure returns (uint256) {
    return (cyAssetRatio * uint256(assetPrice)) / 10**(18 - cyAssetDecimal) / 10**assetDecimal;
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
