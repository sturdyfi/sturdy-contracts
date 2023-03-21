// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {UniswapAdapter} from '../protocol/libraries/swap/UniswapAdapter.sol';
import {BalancerswapAdapter} from '../protocol/libraries/swap/BalancerswapAdapter.sol';
import {CurveswapAdapter} from '../protocol/libraries/swap/CurveswapAdapter.sol';

interface IGeneralLevSwap {
  enum FlashLoanType {
    AAVE,
    BALANCER
  }

  enum SwapType {
    NONE,
    UNISWAP,
    BALANCER,
    CURVE
  }

  struct SwapPath {
    UniswapAdapter.Path u_path;
    BalancerswapAdapter.Path b_path;
    CurveswapAdapter.Path c_path;
    SwapType swapType;
    address[2] swapInOutToken;
  }

  struct FlashLoanParams {
    bool isEnterPosition;
    uint256 slippage;
    uint256 minCollateralAmount;
    address user;
    address sAsset;
    SwapPath[] paths;
    SwapPath[] reversePaths;
  }

  struct LeverageParams {
    address user;
    uint256 principal;
    uint256 leverage;
    uint256 slippage;
    address borrowAsset;
    FlashLoanType flashLoanType;
    SwapPath[] paths;
  }

  function enterPositionWithFlashloan(
    uint256 _principal,
    uint256 _leverage,
    uint256 _slippage,
    address _stableAsset,
    FlashLoanType _flashLoanType
  ) external;

  function withdrawWithFlashloan(
    uint256 _repayAmount,
    uint256 _requiredAmount,
    uint256 _slippage,
    address _stableAsset,
    address _sAsset,
    FlashLoanType _flashLoanType
  ) external;

  function zapDeposit(address _zappingAsset, uint256 _principal, uint256 _slippage) external;

  function zapLeverageWithFlashloan(
    address _zappingAsset,
    uint256 _principal,
    uint256 _leverage,
    uint256 _slippage,
    address _borrowAsset,
    FlashLoanType _flashLoanType
  ) external;

  function getAvailableStableCoins() external pure returns (address[] memory);
}
