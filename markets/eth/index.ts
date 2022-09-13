import { IEthConfiguration, eEthereumNetwork } from '../../helpers/types';

import { CommonsConfig } from './commons';
import {
  strategyWETH,
} from './reservesConfigs';

// ----------------
// POOL--SPECIFIC PARAMS
// ----------------

export const EthConfig: IEthConfiguration = {
  ...CommonsConfig,
  MarketId: 'Sturdy_eth genesis market',
  ProviderId: 3,
  ReservesConfig: {
    WETH: strategyWETH,
  },
  ReserveAssets: {
    [eEthereumNetwork.main]: {
      WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    },
    [eEthereumNetwork.tenderly]: {
      WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    },
    [eEthereumNetwork.goerli]: {
      WETH: '0x0Bb7509324cE409F7bbC4b701f932eAca9736AB7',
    },
  }
};

export default EthConfig;
