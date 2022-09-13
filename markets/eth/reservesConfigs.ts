import { eContractid, IReserveParams } from '../../helpers/types';

import { 
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