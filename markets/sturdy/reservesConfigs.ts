import { eContractid, IReserveParams } from '../../helpers/types';

import { 
  rateStrategyStableTwo,
  rateStrategySTETH,
  rateStrategyYVRETH_WSTETH,
  rateStrategyCVXRETH_WSTETH,
  rateStrategyCVXFRAX_3CRV,
  rateStrategyCVXSTECRV,
  rateStrategyCVXDOLA_3CRV,
  rateStrategyCVXMIM_3CRV,
  rateStrategyCVXDAI_USDC_USDT_SUSD,
  rateStrategyCVXHBTC_WBTC,
  rateStrategyCVXIRON_BANK,
  rateStrategyCVXFRAX_USDC,
  rateStrategyAURADAI_USDC_USDT,
  rateStrategyCVXTUSD_FRAXBP,
  rateStrategyAURABB_A_USD,
  rateStrategyAURABB_A3_USD,
} from './rateStrategies';

export const strategyDAI: IReserveParams = {
  strategy: rateStrategyStableTwo,
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

export const strategyUSDC: IReserveParams = {
  strategy: rateStrategyStableTwo,
  baseLTVAsCollateral: '0',
  liquidationThreshold: '0',
  liquidationBonus: '0',
  borrowingEnabled: true,
  stableBorrowRateEnabled: false,
  reserveDecimals: '6',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
  emissionPerSecond: '10',
};

export const strategyUSDT: IReserveParams = {
  strategy: rateStrategyStableTwo,
  baseLTVAsCollateral: '0',
  liquidationThreshold: '0',
  liquidationBonus: '0',
  borrowingEnabled: true,
  stableBorrowRateEnabled: false,
  reserveDecimals: '6',
  aTokenImpl: eContractid.AToken,
  reserveFactor: '1000',
  collateralEnabled: false,
  emissionPerSecond: '10',
};

export const strategySTETH: IReserveParams = {
  strategy: rateStrategySTETH,
  baseLTVAsCollateral: '7000',
  liquidationThreshold: '7500',
  liquidationBonus: '10750',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyYVRETH_WSTETH: IReserveParams = {
  strategy: rateStrategyYVRETH_WSTETH,
  baseLTVAsCollateral: '7000',
  liquidationThreshold: '7500',
  liquidationBonus: '10750',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyCVXRETH_WSTETH: IReserveParams = {
  strategy: rateStrategyCVXRETH_WSTETH,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyCVXFRAX_3CRV: IReserveParams = {
  strategy: rateStrategyCVXFRAX_3CRV,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyCVXSTECRV: IReserveParams = {
  strategy: rateStrategyCVXSTECRV,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyCVXDOLA_3CRV: IReserveParams = {
  strategy: rateStrategyCVXDOLA_3CRV,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyCVXMIM_3CRV: IReserveParams = {
  strategy: rateStrategyCVXMIM_3CRV,
  baseLTVAsCollateral: '8300',
  liquidationThreshold: '8500',
  liquidationBonus: '10600',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyCVXDAI_USDC_USDT_SUSD: IReserveParams = {
  strategy: rateStrategyCVXDAI_USDC_USDT_SUSD,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyCVXHBTC_WBTC: IReserveParams = {
  strategy: rateStrategyCVXHBTC_WBTC,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyCVXIRON_BANK: IReserveParams = {
  strategy: rateStrategyCVXIRON_BANK,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyCVXFRAX_USDC: IReserveParams = {
  strategy: rateStrategyCVXFRAX_USDC,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyAURADAI_USDC_USDT: IReserveParams = {
  strategy: rateStrategyAURADAI_USDC_USDT,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyCVXTUSD_FRAXBP: IReserveParams = {
  strategy: rateStrategyCVXTUSD_FRAXBP,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyAURABB_A_USD: IReserveParams = {
  strategy: rateStrategyAURABB_A_USD,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};

export const strategyAURABB_A3_USD: IReserveParams = {
  strategy: rateStrategyAURABB_A3_USD,
  baseLTVAsCollateral: '9000',
  liquidationThreshold: '9300',
  liquidationBonus: '10200',
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  reserveDecimals: '18',
  aTokenImpl: eContractid.ATokenForCollateral,
  reserveFactor: '0',
  collateralEnabled: true,
  emissionPerSecond: '0',
};