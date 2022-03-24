// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import {Ownable} from '../dependencies/openzeppelin/contracts/Ownable.sol';
import {IBalancerVault} from '../interfaces/IBalancerVault.sol';
import {Variable, IBalancerWeightedPool} from '../interfaces/IBalancerWeightedPool.sol';
import './interfaces/IOracle.sol';
import '../interfaces/IChainlinkAggregator.sol';
import '../protocol/libraries/math/BoringMath.sol';
import '../dependencies/openzeppelin/contracts/IERC20.sol';
import '../interfaces/IUniswapV2Pair.sol';
import '../lib/FixedPoint.sol';

contract FBeetsOracle is IOracle, Ownable {
  using FixedPoint for *;
  using BoringMath for uint256;
  uint256 public constant PERIOD = 10 minutes;
  IChainlinkAggregator public constant FTM_USD =
    IChainlinkAggregator(0xf4766552D15AE4d256Ad41B6cf2933482B0680dc);
  // IBalancerVault public constant BeethOven_Vault =
  //   IBalancerVault(0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce);
  IBalancerWeightedPool public constant BEETS_FTM =
    IBalancerWeightedPool(0xcdE5a11a4ACB4eE4c805352Cec57E236bdBC3837);

  function get() public override returns (bool, uint256) {
    return (false, 0);
  }

  function peek() public view override returns (bool, int256) {
    return (false, 0);
  }

  // Check the current spot exchange rate without any state changes
  /// @inheritdoc IOracle
  function latestAnswer() external view override returns (int256 rate) {
    uint256 _latestAnswer = BEETS_FTM.getLatest(Variable.BPT_PRICE);
    rate = int256(_latestAnswer.mul(uint256(FTM_USD.latestAnswer())) / 1e18);
  }
}
