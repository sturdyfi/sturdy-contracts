import { ISturdyConfiguration, eEthereumNetwork } from '../../helpers/types';

import { CommonsConfig } from './commons';
import {
  strategyDAI,
  strategyUSDC,
  strategySTETH,
} from './reservesConfigs';

// ----------------
// POOL--SPECIFIC PARAMS
// ----------------

export const SturdyConfig: ISturdyConfiguration = {
  ...CommonsConfig,
  MarketId: 'Sturdy genesis market',
  ProviderId: 1,
  ReservesConfig: {
    DAI: strategyDAI,
    USDC: strategyUSDC,
    stETH: strategySTETH
  },
  ReserveAssets: {
    [eEthereumNetwork.buidlerevm]: {},
    [eEthereumNetwork.hardhat]: {},
    [eEthereumNetwork.geth]: {},
    [eEthereumNetwork.localhost]: {},
    [eEthereumNetwork.coverage]: {},
    [eEthereumNetwork.kovan]: {
      DAI: '0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD',
      USDC: '0xe22da380ee6B445bb8273C81944ADEB6E8450422',
    },
    [eEthereumNetwork.ropsten]: {
      DAI: '0xf80A32A835F79D7787E8a8ee5721D0fEaFd78108',
      USDC: '0x851dEf71f0e6A903375C1e536Bd9ff1684BAD802',
    },
    [eEthereumNetwork.main]: {
      DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      stETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    },
    [eEthereumNetwork.tenderly]: {
      DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      stETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    },
    [eEthereumNetwork.goerli]: {
      DAI: '0x3c189008333eeDA351Df6C601cf6Da7C1BC4Df1A',
      USDC: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
      stETH: '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F',
    },
  },
  Lido: {
    [eEthereumNetwork.coverage]: '',
    [eEthereumNetwork.hardhat]: '',
    [eEthereumNetwork.geth]: '',
    [eEthereumNetwork.localhost]: '',
    [eEthereumNetwork.buidlerevm]: '',
    [eEthereumNetwork.kovan]: '',
    [eEthereumNetwork.ropsten]: '',
    [eEthereumNetwork.main]: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F',
  },
  CurveswapLidoPool: {
    [eEthereumNetwork.coverage]: '',
    [eEthereumNetwork.hardhat]: '',
    [eEthereumNetwork.geth]: '',
    [eEthereumNetwork.localhost]: '',
    [eEthereumNetwork.buidlerevm]: '',
    [eEthereumNetwork.kovan]: '',
    [eEthereumNetwork.ropsten]: '',
    [eEthereumNetwork.main]: '0xDC24316b9AE028F1497c275EB9192a3Ea0f67022',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '0xCEB67769c63cfFc6C8a6c68e85aBE1Df396B7aDA',
  },
  UniswapRouter: {
    [eEthereumNetwork.coverage]: '',
    [eEthereumNetwork.hardhat]: '',
    [eEthereumNetwork.geth]: '',
    [eEthereumNetwork.localhost]: '',
    [eEthereumNetwork.buidlerevm]: '',
    [eEthereumNetwork.kovan]: '',
    [eEthereumNetwork.ropsten]: '',
    [eEthereumNetwork.main]: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  AavePool: {
    [eEthereumNetwork.coverage]: '',
    [eEthereumNetwork.hardhat]: '',
    [eEthereumNetwork.geth]: '',
    [eEthereumNetwork.localhost]: '',
    [eEthereumNetwork.buidlerevm]: '',
    [eEthereumNetwork.kovan]: '',
    [eEthereumNetwork.ropsten]: '',
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
};

export default SturdyConfig;
