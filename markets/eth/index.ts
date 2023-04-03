import { IEthConfiguration, eEthereumNetwork } from '../../helpers/types';

import { CommonsConfig } from './commons';
import {
  strategyAURARETH_WETH,
  strategyAURAWSTETH_WETH,
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
    cvxETH_STETH: strategyCVXETH_STETH,
    auraWSTETH_WETH: strategyAURAWSTETH_WETH,
    auraRETH_WETH: strategyAURARETH_WETH,
  },
  ReserveAssets: {
    [eEthereumNetwork.main]: {
      WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      cvxETH_STETH: '0x901247D08BEbFD449526Da92941B35D756873Bcd',
      auraWSTETH_WETH: '0x10aA9eea35A3102Cc47d4d93Bc0BA9aE45557746',
      auraRETH_WETH: '',
    },
    [eEthereumNetwork.tenderly]: {
      WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      cvxETH_STETH: '0x901247D08BEbFD449526Da92941B35D756873Bcd',
      auraWSTETH_WETH: '0x10aA9eea35A3102Cc47d4d93Bc0BA9aE45557746',
      auraRETH_WETH: '',
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
  BAL: {
    [eEthereumNetwork.main]: '0xba100000625a3754423978a60c9317c58a424e3D',
    [eEthereumNetwork.tenderly]: '0xba100000625a3754423978a60c9317c58a424e3D',
  },
  AURA: {
    [eEthereumNetwork.main]: '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF',
    [eEthereumNetwork.tenderly]: '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF',
  },
  LDO: {
    [eEthereumNetwork.main]: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    [eEthereumNetwork.tenderly]: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
  },
  STETH: {
    [eEthereumNetwork.main]: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    [eEthereumNetwork.tenderly]: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  },
  ETH_STETH_LP: {
    [eEthereumNetwork.main]: '0x06325440D014e39736583c165C2963BA99fAf14E',
    [eEthereumNetwork.tenderly]: '0x06325440D014e39736583c165C2963BA99fAf14E',
  },
  BAL_WSTETH_WETH_LP: {
    [eEthereumNetwork.main]: '0x32296969Ef14EB0c6d29669C550D4a0449130230',
    [eEthereumNetwork.tenderly]: '0x32296969Ef14EB0c6d29669C550D4a0449130230',
  },
  BAL_RETH_WETH_LP: {
    [eEthereumNetwork.main]: '0x1E19CF2D73a72Ef1332C882F20534B6519Be0276',
    [eEthereumNetwork.tenderly]: '0x1E19CF2D73a72Ef1332C882F20534B6519Be0276',
  },
  UniswapRouter: {
    [eEthereumNetwork.main]: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    [eEthereumNetwork.tenderly]: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  CurveswapAddressProvider: {
    [eEthereumNetwork.main]: '0x0000000022D53366457F9d5E68Ec105046FC4383',
    [eEthereumNetwork.tenderly]: '0x0000000022D53366457F9d5E68Ec105046FC4383',
  }
};

export default EthConfig;
