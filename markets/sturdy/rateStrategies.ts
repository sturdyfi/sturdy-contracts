import BigNumber from 'bignumber.js';
import { oneRay } from '../../helpers/constants';
import { IInterestRateStrategyParams } from '../../helpers/types';

// DAI
export const rateStrategyStableTwo: IInterestRateStrategyParams = {
  name: "rateStrategyStableTwo",
  optimalUtilizationRate: new BigNumber(0.8).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0' /* new BigNumber(0).multipliedBy(oneRay).toFixed() */,
  variableRateSlope1: '0' /* new BigNumber(0.04).multipliedBy(oneRay).toFixed() */,
  variableRateSlope2: '0' /* new BigNumber(0.75).multipliedBy(oneRay).toFixed() */,
  stableRateSlope1: '0' /* new BigNumber(0.02).multipliedBy(oneRay).toFixed() */,
  stableRateSlope2: '0' /* new BigNumber(0.75).multipliedBy(oneRay).toFixed() */,
}

// USDC
export const rateStrategyStableThree: IInterestRateStrategyParams = {
  name: "rateStrategyStableThree",
  optimalUtilizationRate: new BigNumber(0.9).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0' /* new BigNumber(0).multipliedBy(oneRay).toFixed() */,
  variableRateSlope1: '0' /* new BigNumber(0.04).multipliedBy(oneRay).toFixed() */,
  variableRateSlope2: '0' /* new BigNumber(0.60).multipliedBy(oneRay).toFixed() */,
  stableRateSlope1: '0' /* new BigNumber(0.02).multipliedBy(oneRay).toFixed() */,
  stableRateSlope2: '0' /* new BigNumber(0.60).multipliedBy(oneRay).toFixed() */,
}

// stETH
export const rateStrategySTETH: IInterestRateStrategyParams = {
    name: "rateStrategySTETH",
    optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
    baseVariableBorrowRate: '0',
    variableRateSlope1: '0',
    variableRateSlope2: '0',
    stableRateSlope1: '0',
    stableRateSlope2: '0',
  }

// yvRETH_WSTETH
export const rateStrategyYVRETH_WSTETH: IInterestRateStrategyParams = {
  name: "rateStrategyYVRETH_WSTETH",
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
}

// cvxRETH_WSTETH
export const rateStrategyCVXRETH_WSTETH: IInterestRateStrategyParams = {
  name: "rateStrategyCVXRETH_WSTETH",
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
}

// cvxFRAX_3CRV
export const rateStrategyCVXFRAX_3CRV: IInterestRateStrategyParams = {
  name: "rateStrategyCVXFRAX_3CRV",
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
}

// cvxSTECRV
export const rateStrategyCVXSTECRV: IInterestRateStrategyParams = {
  name: "rateStrategyCVXSTECRV",
  optimalUtilizationRate: new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
  baseVariableBorrowRate: '0',
  variableRateSlope1: '0',
  variableRateSlope2: '0',
  stableRateSlope1: '0',
  stableRateSlope2: '0',
}