import { eContractid, IReserveParams } from '../../helpers/types';

import { 
  rateStrategyCVXETH_STETH,
  rateStrategyWETH,
} from './rateStrategies';

export const strategyWETH: IReserveParams = {
  strategy: rateStrategyWETH,
  baseLTVAsCollateral: '0',
  liquidationThreshold: '0',
  liquidationBonus: '0',
  borrowingEnabled: true,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
  emissionPerSecond: '10',
};

export const strategyCVXETH_STETH: IReserveParams = {
  strategy: rateStrategyCVXETH_STETH,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '10',
  };