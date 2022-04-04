// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

interface IYearnFBEETSVault {
  function beethoven_BEETS_FTM_PoolId() external view returns (bytes32);

  function beethovenSwapPoolId() external view returns (bytes32);

  function getBeethovenVault() external view returns (address);
}
