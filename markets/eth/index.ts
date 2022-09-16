import { IEthConfiguration, eEthereumNetwork } from '../../helpers/types';

import { CommonsConfig } from './commons';
import {
  strategyCVXETH_STETH,
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
    cvxETH_STETH: strategyCVXETH_STETH
  },
  ReserveAssets: {
    [eEthereumNetwork.main]: {
      WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      cvxETH_STETH: '',
    },
    [eEthereumNetwork.tenderly]: {
      WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      cvxETH_STETH: '',
    },
  },
  CRV: {
    [eEthereumNetwork.main]: '0xD533a949740bb3306d119CC777fa900bA034cd52',
    [eEthereumNetwork.tenderly]: '0xD533a949740bb3306d119CC777fa900bA034cd52',
  },
  CVX: {
    [eEthereumNetwork.main]: '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B',
    [eEthereumNetwork.tenderly]: '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B',
  },
  ETH_STETH_LP: {
    [eEthereumNetwork.main]: '0x06325440D014e39736583c165C2963BA99fAf14E',
    [eEthereumNetwork.tenderly]: '0x06325440D014e39736583c165C2963BA99fAf14E',
  },
  UniswapRouter: {
    [eEthereumNetwork.main]: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    [eEthereumNetwork.tenderly]: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
};

export default EthConfig;
