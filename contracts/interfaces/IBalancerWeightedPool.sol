// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

enum Variable {
  PAIR_PRICE,
  BPT_PRICE,
  INVARIANT
}

interface IBalancerWeightedPool {
  // The three values that can be queried:
  //
  // - PAIR_PRICE: the price of the tokens in the Pool, expressed as the price of the second token in units of the
  //   first token. For example, if token A is worth $2, and token B is worth $4, the pair price will be 2.0.
  //   Note that the price is computed *including* the tokens decimals. This means that the pair price of a Pool with
  //   DAI and USDC will be close to 1.0, despite DAI having 18 decimals and USDC 6.
  //
  // - BPT_PRICE: the price of the Pool share token (BPT), in units of the first token.
  //   Note that the price is computed *including* the tokens decimals. This means that the BPT price of a Pool with
  //   USDC in which BPT is worth $5 will be 5.0, despite the BPT having 18 decimals and USDC 6.
  //
  // - INVARIANT: the value of the Pool's invariant, which serves as a measure of its liquidity.

  /**
   * @dev Returns latest sample of `variable`. Prices are represented as 18 decimal fixed point values.
   */
  function getLatest(Variable variable) external view returns (uint256);

  function getPoolId() external view returns (bytes32);

  /**
   * @dev Returns the pool's current swap fee.
   */
  function getSwapFeePercentage() external view returns (uint256);

  enum ExitKind {
    EXACT_BPT_IN_FOR_ONE_TOKEN_OUT,
    EXACT_BPT_IN_FOR_TOKENS_OUT,
    BPT_IN_FOR_EXACT_TOKENS_OUT,
    MANAGEMENT_FEE_TOKENS_OUT // for ManagedPool
  }
}
