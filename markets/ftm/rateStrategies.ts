import BigNumber from 'bignumber.js';
import { oneRay } from '../../helpers/constants';
import { IInterestRateStrategyParams } from '../../helpers/types';

// DAI
export const rateStrategyStableTwo: IInterestRateStrategyParams = {
  name: 'rateStrategyStableTwo',
  optimalUtilizationRate: new BigNumber(0.8).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0' /* new BigNumber(0).multipliedBy(oneRay).toFixed() */,
  variableRateSlope1: '0' /* new BigNumber(0.04).multipliedBy(oneRay).toFixed() */,
  variableRateSlope2: '0' /* new BigNumber(0.75).multipliedBy(oneRay).toFixed() */,
  stableRateSlope1: '0' /* new BigNumber(0.02).multipliedBy(oneRay).toFixed() */,
  stableRateSlope2: '0' /* new BigNumber(0.75).multipliedBy(oneRay).toFixed() */,
};

// USDC, USDT
export const rateStrategyStableThree: IInterestRateStrategyParams = {
  name: 'rateStrategyStableThree',
  optimalUtilizationRate: new BigNumber(0.9).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0' /* new BigNumber(0).multipliedBy(oneRay).toFixed() */,
  variableRateSlope1: '0' /* new BigNumber(0.04).multipliedBy(oneRay).toFixed() */,
  variableRateSlope2: '0' /* new BigNumber(0.60).multipliedBy(oneRay).toFixed() */,
  stableRateSlope1: '0' /* new BigNumber(0.02).multipliedBy(oneRay).toFixed() */,
  stableRateSlope2: '0' /* new BigNumber(0.60).multipliedBy(oneRay).toFixed() */,
};

// yvWFTM
export const rateStrategyYVWFTM: IInterestRateStrategyParams = {
  name: 'rateStrategyYVWFTM',
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
};

// // mooWETH
// export const rateStrategyMOOWETH: IInterestRateStrategyParams = {
//   name: 'rateStrategyMOOWETH',
//   optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
//   baseVariableBorrowRate: '0',
//   variableRateSlope1: '0',
//   variableRateSlope2: '0',
//   stableRateSlope1: '0',
//   stableRateSlope2: '0',
// };

// yvWETH
export const rateStrategyYVWETH: IInterestRateStrategyParams = {
  name: 'rateStrategyYVWETH',
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
};

// yvWBTC
export const rateStrategyYVWBTC: IInterestRateStrategyParams = {
  name: 'rateStrategyYVWBTC',
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
};

// yvBOO
export const rateStrategyYVBOO: IInterestRateStrategyParams = {
  name: 'rateStrategyYVBOO',
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
};