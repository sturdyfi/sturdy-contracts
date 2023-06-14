// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity ^0.8.0;

import './interfaces/IOracle.sol';
import './interfaces/IOracleValidate.sol';
import '../interfaces/ICurvePool.sol';
import '../interfaces/ICurvePoolAdmin.sol';
import '../interfaces/IChainlinkAggregator.sol';
import {Errors} from '../protocol/libraries/helpers/Errors.sol';
import {Math} from '../dependencies/openzeppelin/contracts/Math.sol';
import {IERC20Detailed} from '../dependencies/openzeppelin/contracts/IERC20Detailed.sol';

/**
 * @dev Oracle contract for ETHSTETH LP Token
 */
contract ETHSTETHOracle is IOracle, IOracleValidate {
  ICurvePool private constant ETHSTETH = ICurvePool(0xDC24316b9AE028F1497c275EB9192a3Ea0f67022);
  IERC20Detailed private constant ETHSTETH_LP =
    IERC20Detailed(0x06325440D014e39736583c165C2963BA99fAf14E);
  ICurvePoolAdmin private constant ADMIN =
    ICurvePoolAdmin(0xeCb456EA5365865EbAb8a2661B0c503410e9B347);
  IChainlinkAggregator private constant STETH =
    IChainlinkAggregator(0x86392dC19c0b719886221c78AB11eb8Cf5c52812);

  /**
   * @dev Get LP Token Price
   */
  function _get() internal view returns (uint256) {
    (, int256 stETHPrice, , uint256 updatedAt, ) = STETH.latestRoundData();

    require(STETH.decimals() == 18, Errors.O_WRONG_PRICE);
    require(updatedAt > block.timestamp - 1 days, Errors.O_WRONG_PRICE);
    require(stETHPrice > 0, Errors.O_WRONG_PRICE);

    uint256 minValue = Math.min(uint256(stETHPrice), 1e18);

    return (ETHSTETH.get_virtual_price() * minValue) / 1e18;
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

  // Check the oracle (re-entrancy)
  /// @inheritdoc IOracleValidate
  function check() external {
    ADMIN.withdraw_admin_fees(address(ETHSTETH));
  }
}
