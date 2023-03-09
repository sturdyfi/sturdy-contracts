import BigNumber from 'bignumber.js';
import { oneEther, oneRay } from '../../helpers/constants';
import { IInterestRateStrategyParams } from '../../helpers/types';

// WETH
export const rateStrategyWETH: IInterestRateStrategyParams = {
  name: "rateStrategyWETH",
  optimalUtilizationRate: new BigNumber(0.8).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0' /* new BigNumber(0).multipliedBy(oneRay).toFixed() */,
  variableRateSlope1: '0' /* new BigNumber(0.04).multipliedBy(oneRay).toFixed() */,
  variableRateSlope2: new BigNumber(0.6).multipliedBy(oneRay).toFixed(),
  stableRateSlope1: '0' /* new BigNumber(0.02).multipliedBy(oneRay).toFixed() */,
  stableRateSlope2: '0' /* new BigNumber(0.75).multipliedBy(oneRay).toFixed() */,
  capacity: '0',
}

// cvxETH_STETH
export const rateStrategyCVXETH_STETH: IInterestRateStrategyParams = {
  name: "rateStrategyCVXETH_STETH",
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
  capacity: new BigNumber(500).multipliedBy(oneEther).toFixed(),
}

// auraWSTETH_WETH
export const rateStrategyAURAWSTETH_WETH: IInterestRateStrategyParams = {
  name: "rateStrategyAURAWSTETH_WETH",
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
  capacity: '0',
}

// auraRETH_WETH
export const rateStrategyAURARETH_WETH: IInterestRateStrategyParams = {
  name: "rateStrategyAURARETH_WETH",
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
  capacity: '0',
}