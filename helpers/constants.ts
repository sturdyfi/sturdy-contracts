import BigNumber from 'bignumber.js';

// ----------------
// MATH
// ----------------

export const PERCENTAGE_FACTOR = '10000';
export const HALF_PERCENTAGE = '5000';
export const WAD = Math.pow(10, 18).toString();
export const HALF_WAD = new BigNumber(WAD).multipliedBy(0.5).toString();
export const RAY = new BigNumber(10).exponentiatedBy(27).toFixed();
export const HALF_RAY = new BigNumber(RAY).multipliedBy(0.5).toFixed();
export const WAD_RAY_RATIO = Math.pow(10, 9).toString();
export const oneEther = new BigNumber(Math.pow(10, 18));
export const oneUsd = new BigNumber(Math.pow(10, 8));
export const oneRay = new BigNumber(Math.pow(10, 27));
export const MAX_UINT_AMOUNT =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';
export const ONE_YEAR = '31536000';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ONE_ADDRESS = '0x0000000000000000000000000000000000000001';
// ----------------
// PROTOCOL GLOBAL PARAMS
// ----------------
export const OPTIMAL_UTILIZATION_RATE = new BigNumber(0.8).times(RAY);
export const EXCESS_UTILIZATION_RATE = new BigNumber(0.2).times(RAY);
export const APPROVAL_AMOUNT_LENDING_POOL = '1000000000000000000000000000';
export const TOKEN_DISTRIBUTOR_PERCENTAGE_BASE = '10000';
export const MOCK_USD_PRICE_IN_WEI = '373068412860';
export const USD_ADDRESS = '0x10F7Fc1F91Ba351f9C629c5947AD69bD03C05b96';
export const STURDY_REFERRAL = '0';

export const MOCK_CHAINLINK_AGGREGATORS_PRICES = {
  DAI: oneEther.multipliedBy('0.000268047349837').toFixed(),
  USDC: oneEther.multipliedBy('0.000267347358572').toFixed(),
  fUSDT: oneEther.multipliedBy('0.000267347358572').toFixed(),
  stETH: oneEther.toFixed(),
  WETH: oneEther.toFixed(),
  // mooWETH: oneEther.toFixed(),
  yvWFTM: oneEther.multipliedBy('0.00075589352654034').toFixed(),
  yvWETH: oneEther.toFixed(),
  yvWBTC: oneEther.multipliedBy('10.721894060489825').toFixed(),
  USD: '373068412860',
};
