// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IGeneralLevSwap {
  enum FlashLoanType {
    AAVE,
    BALANCER
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

  function zapDeposit(
    address _zappingAsset,
    uint256 _principal,
    uint256 _slippage
  ) external;

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
