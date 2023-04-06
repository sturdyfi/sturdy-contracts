// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

library DistributionTypes {
  struct AssetConfigInput {
    uint104 emissionPerSecond;
    uint256 totalStaked;
    address underlyingAsset;
  }

  struct UserStakeInput {
    address underlyingAsset;
    uint256 stakedByUser;
    uint256 totalStaked;
  }

  struct AssetConfigInputForYield {
    uint256 totalStaked;
    address underlyingAsset;
  }
}
