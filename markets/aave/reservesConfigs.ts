import { eContractid, IReserveParams } from '../../helpers/types';

import { 
  rateStrategyStableOne,
  rateStrategyStableTwo,
  rateStrategyStableThree,
  rateStrategyWETH,
  rateStrategyAAVE,
  rateStrategyVolatileOne,
  rateStrategyVolatileTwo,
  rateStrategyVolatileThree,
  rateStrategyVolatileFour,
  rateStrategySTETH
} from './rateStrategies';

export const strategyBUSD: IReserveParams = {
  strategy: rateStrategyStableOne,
  baseLTVAsCollateral: '0',
  liquidationThreshold: '0',
  liquidationBonus: '0',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
};

export const strategyDAI: IReserveParams = {
  strategy: rateStrategyStableTwo,
  baseLTVAsCollateral: '0'/*'7500'*/,
  liquidationThreshold: '0'/*'8000'*/,
  liquidationBonus: '0'/*'10500'*/,
  borrowingEnabled: true,
  stableBorrowRateEnabled: true,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
};

export const strategySUSD: IReserveParams = {
  strategy: rateStrategyStableOne,
  baseLTVAsCollateral: '0',
  liquidationThreshold: '0',
  liquidationBonus: '0',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '2000',
  collateralEnabled: false,
};

export const strategyTUSD: IReserveParams = {
  strategy: rateStrategyStableTwo,
  baseLTVAsCollateral: '0'/*'7500'*/,
  liquidationThreshold: '0'/*'8000'*/,
  liquidationBonus: '0'/*'10500'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
};

export const strategyUSDC: IReserveParams = {
  strategy: rateStrategyStableThree,
  baseLTVAsCollateral: '0'/*'7500'*/,
  liquidationThreshold: '0'/*'8000'*/,
  liquidationBonus: '0'/*'10500'*/,
  borrowingEnabled: true,
  stableBorrowRateEnabled: true,
  reserveDecimals: '6',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
};

export const strategyUSDT: IReserveParams = {
  strategy: rateStrategyStableThree,
  baseLTVAsCollateral: '0'/*'8000'*/,
  liquidationThreshold: '0'/*'8500'*/,
  liquidationBonus: '0'/*'10500'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '6',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
};

export const strategyAAVE: IReserveParams = {
  strategy: rateStrategyAAVE,
  baseLTVAsCollateral: '0'/*'5000'*/,
  liquidationThreshold: '0'/*'6500'*/,
  liquidationBonus: '0'/*'11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '0',
  collateralEnabled: false,
};

export const strategyBAT: IReserveParams = {
  strategy: rateStrategyVolatileOne,
  baseLTVAsCollateral: '0'/*'7000'*/,
  liquidationThreshold: '0'/*'7500'*/,
  liquidationBonus: '0'/*'11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '2000',
  collateralEnabled: false,
};

export const strategyENJ: IReserveParams = {
  strategy: rateStrategyVolatileOne,
  baseLTVAsCollateral: '0'/*'5500'*/,
  liquidationThreshold: '0'/*'6000'*/,
  liquidationBonus: '0'/*'11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '2000',
  collateralEnabled: false,
};

export const strategyWETH: IReserveParams = {
  strategy: rateStrategyWETH,
  baseLTVAsCollateral: '0'/*'8000'*/,
  liquidationThreshold: '0'/*'8250'*/,
  liquidationBonus: '0'/*'10500'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
};

export const strategyKNC: IReserveParams = {
  strategy: rateStrategyVolatileTwo,
  baseLTVAsCollateral: '0'/*'6000'*/,
  liquidationThreshold: '0'/*'6500'*/,
  liquidationBonus: '0'/*'11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '2000',
  collateralEnabled: false,
};

export const strategyLINK: IReserveParams = {
  strategy: rateStrategyVolatileOne,
  baseLTVAsCollateral: '0'/*'7000'*/,
  liquidationThreshold: '0'/*'7500'*/,
  liquidationBonus: '0'/*'11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '2000',
  collateralEnabled: false,
};

export const strategyMANA: IReserveParams = {
  strategy: rateStrategyVolatileOne,
  baseLTVAsCollateral: '0'/*'6000'*/,
  liquidationThreshold: '0'/*'6500'*/,
  liquidationBonus: '0'/*'11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '3500',
  collateralEnabled: false,
};

export const strategyMKR: IReserveParams = {
  strategy: rateStrategyVolatileOne,
  baseLTVAsCollateral: '0'/*'6000'*/,
  liquidationThreshold: '0'/*'6500'*/,
  liquidationBonus: '0'/*'11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '2000',
  collateralEnabled: false,
};

export const strategyREN: IReserveParams = {
  strategy: rateStrategyVolatileOne,
  baseLTVAsCollateral: '0'/*'5500'*/,
  liquidationThreshold: '0'/*'6000'*/,
  liquidationBonus: '0'/*'11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '2000',
  collateralEnabled: false,
};

export const strategySNX: IReserveParams = {
  strategy: rateStrategyVolatileThree,
  baseLTVAsCollateral: '0'/*'1500'*/,
  liquidationThreshold: '0'/*'4000'*/,
  liquidationBonus: '0'/*'11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '3500',
  collateralEnabled: false,
};

export const strategyWBTC: IReserveParams = {
  strategy: rateStrategyVolatileTwo,
  baseLTVAsCollateral: '0'/*'7000'*/,
  liquidationThreshold: '0'/*'7500'*/,
  liquidationBonus: '0'/*'11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '8',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '2000',
  collateralEnabled: false,
};

export const strategyYFI: IReserveParams = {
  strategy: rateStrategyVolatileOne,
  baseLTVAsCollateral: '0'/*'4000'*/,
  liquidationThreshold: '0'/*'5500'*/,
  liquidationBonus: '0'/*'11500'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '2000',
  collateralEnabled: false,
};

export const strategyZRX: IReserveParams = {
  strategy: rateStrategyVolatileOne,
  baseLTVAsCollateral: '0'/*'6000'*/,
  liquidationThreshold: '0'/*'6500'*/,
  liquidationBonus: '0'/*11000'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '2000',
  collateralEnabled: false,
};

export const strategyXSUSHI: IReserveParams = {
  strategy: rateStrategyVolatileFour,
  baseLTVAsCollateral: '0'/*'2500'*/,
  liquidationThreshold: '0'/*'4500'*/,
  liquidationBonus: '0'/*'11500'*/,
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '3500',
  collateralEnabled: false,
};

export const strategySTETH: IReserveParams = {
  strategy: rateStrategySTETH,
  baseLTVAsCollateral: '5000',
  liquidationThreshold: '6500',
  liquidationBonus: '11000',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '0',
  collateralEnabled: true,
  };