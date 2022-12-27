// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma abicoder v2;

import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../interfaces/IBalancerStablePool.sol';
import '../interfaces/IWstETH.sol';
import {Errors} from '../protocol/libraries/helpers/Errors.sol';
import {Math} from '../dependencies/openzeppelin/contracts/Math.sol';

/**
 * @dev Oracle contract for BALWSTETHWETH LP Token
 */
contract BALWSTETHWETHOracle is IOracle {
  IBalancerStablePool private constant BALWSTETHWETH =
    IBalancerStablePool(0x32296969Ef14EB0c6d29669C550D4a0449130230);
  IChainlinkAggregator private constant STETH =
    IChainlinkAggregator(0x86392dC19c0b719886221c78AB11eb8Cf5c52812);
  IWstETH private constant WSTETH = IWstETH(0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0);

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    (, int256 stETHPrice, , uint256 updatedAt, ) = STETH.latestRoundData();
    require(updatedAt > block.timestamp - 1 days, Errors.O_WRONG_PRICE);
    require(stETHPrice > 0, Errors.O_WRONG_PRICE);

    uint256 minValue = Math.min((uint256(stETHPrice) * WSTETH.stEthPerToken()) / 1e18, 1e18);

    return (BALWSTETHWETH.getRate() * minValue) / 1e18;
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
