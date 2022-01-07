import { eFantomNetwork, IFantomConfiguration } from '../../helpers/types';

import { CommonsConfig } from './commons';
import {
  strategyDAI,
  strategyUSDC,
  strategyYVWFTM,
} from './reservesConfigs';

// ----------------
// POOL--SPECIFIC PARAMS
// ----------------

export const FantomConfig: IFantomConfiguration = {
  ...CommonsConfig,
  MarketId: 'Fantom market',
  ProviderId: 2,
  ReservesConfig: {
    DAI: strategyDAI,
    USDC: strategyUSDC,
    yvWFTM: strategyYVWFTM
  },
  ReserveAssets: {
    [eFantomNetwork.ftm]: {
      DAI: '0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E',
      USDC: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
      yvWFTM: '0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0'
    },
    [eFantomNetwork.tenderlyFTM]: {
      DAI: '0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E',
      USDC: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
      yvWFTM: '0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0'
    },
  },
  YearnVaultFTM: {
    [eFantomNetwork.ftm]: '0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0',
    [eFantomNetwork.tenderlyFTM]: '0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0',
  }
};

export default FantomConfig;
