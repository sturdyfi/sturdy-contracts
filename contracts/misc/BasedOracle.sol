// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma abicoder v2;
import {Ownable} from '../dependencies/openzeppelin/contracts/Ownable.sol';
import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../dependencies/openzeppelin/contracts/IERC20.sol';
import '../interfaces/IUniswapV2Pair.sol';
import '../lib/FixedPoint.sol';

contract BasedOracle is IOracle, Ownable {
  using FixedPoint for *;
  uint256 private constant PERIOD = 10 minutes;
  IChainlinkAggregator private constant MIMATIC_USD =
    IChainlinkAggregator(0x827863222c9C603960dE6FF2c0dD58D457Dcc363);
  IUniswapV2Pair private constant BASED_MIMATIC =
    IUniswapV2Pair(0x7B5B3751550be4FF87aC6bda89533F7A0c9825B3);
  bool isCumulativePrice;

  struct PairInfo {
    uint256 priceCumulativeLast;
    uint256 priceAverage;
    uint32 blockTimestampLast;
  }

  PairInfo public pairInfo;

  function _get(uint32 blockTimestamp) internal view returns (uint256) {
    uint256 priceCumulative = BASED_MIMATIC.price0CumulativeLast();

    // if time has elapsed since the last update on the pair, mock the accumulated price values
    (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IUniswapV2Pair(BASED_MIMATIC)
      .getReserves();
    priceCumulative +=
      uint256(FixedPoint.fraction(reserve1, reserve0)._x) *
      (blockTimestamp - blockTimestampLast); // overflows ok

    // overflow is desired, casting never truncates
    // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
    return priceCumulative;
  }

  // Get the latest exchange rate, if no valid (recent) rate is available, return false
  /// @inheritdoc IOracle
  function get() public override returns (bool, uint256) {
    uint32 blockTimestamp = uint32(block.timestamp);
    if (pairInfo.blockTimestampLast == 0) {
      pairInfo.blockTimestampLast = blockTimestamp;
      pairInfo.priceCumulativeLast = _get(blockTimestamp);
      return (false, 0);
    }
    uint32 timeElapsed = blockTimestamp - pairInfo.blockTimestampLast; // overflow is desired

    if (timeElapsed < PERIOD) {
      return (true, pairInfo.priceAverage);
    }

    uint256 priceCumulative = _get(blockTimestamp);
    pairInfo.priceAverage =
      (uint256(
        FixedPoint
          .uq112x112(uint224((priceCumulative - pairInfo.priceCumulativeLast) / timeElapsed))
          .mul(1e18)
          .decode144()
      ) * uint256(MIMATIC_USD.latestAnswer())) /
      1e18;

    pairInfo.blockTimestampLast = blockTimestamp;
    pairInfo.priceCumulativeLast = priceCumulative;

    return (true, pairInfo.priceAverage);
  }

  // Check the last exchange rate without any state changes
  /// @inheritdoc IOracle
  function peek() public view override returns (bool, int256) {
    uint32 blockTimestamp = uint32(block.timestamp);
    if (pairInfo.blockTimestampLast == 0) {
      return (false, 0);
    }
    uint32 timeElapsed = blockTimestamp - pairInfo.blockTimestampLast; // overflow is desired
    if (timeElapsed < PERIOD) {
      return (true, int256(pairInfo.priceAverage));
    }

    uint256 priceCumulative = _get(blockTimestamp);
    int256 priceAverage = int256(
      (uint256(
        FixedPoint
          .uq112x112(uint224((priceCumulative - pairInfo.priceCumulativeLast) / timeElapsed))
          .mul(1e18)
          .decode144()
      ) * uint256(MIMATIC_USD.latestAnswer())) / 1e18
    );

    return (true, priceAverage);
  }

  function enableCumulativePrice(bool enable) external payable onlyOwner {
    isCumulativePrice = enable;
    if (enable) {
      get();
    }
  }

  // Check the current spot exchange rate without any state changes
  /// @inheritdoc IOracle
  function latestAnswer() external view override returns (int256 rate) {
    (uint256 reserve0, uint256 reserve1, ) = BASED_MIMATIC.getReserves();
    if (isCumulativePrice) {
      (, rate) = peek();
    }

    if (rate <= 0) {
      rate = int256((((reserve1 * 1e18) / reserve0) * uint256(MIMATIC_USD.latestAnswer())) / 1e18);
    }
  }
}
