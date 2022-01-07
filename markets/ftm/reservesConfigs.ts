import { eContractid, IReserveParams } from '../../helpers/types';

import { 
  rateStrategyStableTwo,
  rateStrategyStableThree,
  rateStrategyYVWFTM
} from './rateStrategies';

export const strategyDAI: IReserveParams = {
  strategy: rateStrategyStableTwo,
  baseLTVAsCollateral: '0'/*'7500'*/,
  liquidationThreshold: '0'/*'8000'*/,
  liquidationBonus: '0'/*'10500'*/,
  borrowingEnabled: true,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
  emissionPerSecond: '10',
};

export const strategyUSDC: IReserveParams = {
  strategy: rateStrategyStableThree,
  baseLTVAsCollateral: '0'/*'7500'*/,
  liquidationThreshold: '0'/*'8000'*/,
  liquidationBonus: '0'/*'10500'*/,
  borrowingEnabled: true,
  stableBorrowRateEnabled: false,
  reserveDecimals: '6',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
  emissionPerSecond: '10',
};

export const strategyYVWFTM: IReserveParams = {
  strategy: rateStrategyYVWFTM,
  baseLTVAsCollateral: '7000',
  liquidationThreshold: '7500',
  liquidationBonus: '10750',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};
