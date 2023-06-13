// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import '@balancer-labs/v2-interfaces/contracts/vault/IVault.sol';
import '@balancer-labs/v2-pool-utils/contracts/lib/VaultReentrancyLib.sol';
import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../interfaces/IBalancerStablePool.sol';
import {Math} from '../dependencies/openzeppelin/contracts/Math.sol';

/**
 * @dev Oracle contract for BALBBAUSD LP Token
 */
contract BALBBAUSDOracle is IOracle {
  IBalancerStablePool private constant BAL_BB_A_USD =
    IBalancerStablePool(0xA13a9247ea42D743238089903570127DdA72fE44);

  IChainlinkAggregator private constant DAI =
    IChainlinkAggregator(0x773616E4d11A78F511299002da57A0a94577F1f4);
  IChainlinkAggregator private constant USDC =
    IChainlinkAggregator(0x986b5E1e1755e3C2440e960477f25201B0a8bbD4);
  IChainlinkAggregator private constant USDT =
    IChainlinkAggregator(0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46);

  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    // Check the oracle (re-entrancy)
    VaultReentrancyLib.ensureNotInVaultContext(IVault(BALANCER_VAULT));

    (, int256 usdcPrice, , , ) = USDC.latestRoundData();
    (, int256 usdtPrice, , , ) = USDT.latestRoundData();
    (, int256 daiPrice, , , ) = DAI.latestRoundData();

    uint256 minValue = Math.min(
      Math.min(uint256(usdcPrice), uint256(usdtPrice)),
      uint256(daiPrice)
    );

    return (BAL_BB_A_USD.getRate() * minValue) / 1e18;
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
