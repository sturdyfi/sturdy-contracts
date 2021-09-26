import { oneRay, ZERO_ADDRESS } from '../../helpers/constants';
import { IAmmConfiguration, eEthereumNetwork } from '../../helpers/types';

import { CommonsConfig } from './commons';
import {
  strategyDAI,
  strategyUSDC,
  strategyUSDT,
  strategyWETH,
  strategyWBTC,
  strategyWBTCWETH,
  strategyDAIWETH,
  strategyAAVEWETH,
  strategyBATWETH,
  strategyDAIUSDC,
  strategyCRVWETH,
  strategyLINKWETH,
  strategyMKRWETH,
  strategyRENWETH,
  strategySNXWETH,
  strategyUNIWETH,
  strategyUSDCWETH,
  strategyWBTCUSDC,
  strategyYFIWETH,
  strategyBALWETH,
} from './reservesConfigs';

// ----------------
// POOL--SPECIFIC PARAMS
// ----------------

export const AmmConfig: IAmmConfiguration = {
  ...CommonsConfig,
  MarketId: 'Aave AMM market',
  ProviderId: 2,
  ReservesConfig: {
    WETH: strategyWETH,
    DAI: strategyDAI,
    USDC: strategyUSDC,
    USDT: strategyUSDT,
   /*  WBTC: strategyWBTC,
    UniDAIWETH: strategyDAIWETH,
    UniWBTCWETH: strategyWBTCWETH,
    UniAAVEWETH: strategyAAVEWETH,
    UniBATWETH: strategyBATWETH,
    UniDAIUSDC: strategyDAIUSDC,
    UniCRVWETH: strategyCRVWETH,
    UniLINKWETH: strategyLINKWETH,
    UniMKRWETH: strategyMKRWETH,
    UniRENWETH: strategyRENWETH,
    UniSNXWETH: strategySNXWETH,
    UniUNIWETH: strategyUNIWETH,
    UniUSDCWETH: strategyUSDCWETH,
    UniWBTCUSDC: strategyWBTCUSDC,
    UniYFIWETH: strategyYFIWETH,
    BptWBTCWETH: strategyWBTCWETH,
    BptBALWETH: strategyBALWETH, */
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
      USDT: '0x13512979ADE267AB5100878E2e0f485B568328a4',
      WBTC: '0xD1B98B6607330172f1D991521145A22BCe793277',
      WETH: '0xd0a1e359811322d97991e03f863a0c30c2cf029c',
      UniDAIWETH: '0x0C652EeEA3d7D35759ba1E16183F1D89C386C9ea',
      UniWBTCWETH: '0x796d562B1dF5b9dc85A4612187B6f29Ed213d960',
      UniAAVEWETH: '0x657A7B8b46F35C5C6583AEF43824744B236EF826',
      UniBATWETH: '0xf8CEBA8b16579956B3aE4B5D09002a30f873F783',
      UniDAIUSDC: '0x8e80b7a7531c276dD1dBEC2f1Cc281c11c859e62',
      UniCRVWETH: '0x9c31b7538467bF0b01e6d5fA789e66Ce540a521e',
      UniLINKWETH: '0x5Acab7f8B79620ec7127A96E5D8837d2124D5D7c',
      UniMKRWETH: '0xB0C6EC5d58ddbF4cd1e419A56a19924E9904e4Dd',
      UniRENWETH: '0xcF428637A9f8Af21920Bc0A94fd81071bc790105',
      UniSNXWETH: '0xc8F2a0d698f675Ece74042e9fB06ea52b9517521',
      UniUNIWETH: '0xcC99A5f95a86d30e3DeF113bCf22f00ecF90D050',
      UniUSDCWETH: '0x8C00D2428ed1857E61652aca663323A85E6e76a9',
      UniWBTCUSDC: '0x3d35B5F289f55A580e6F85eE22E6a8f57053b966',
      UniYFIWETH: '0x5af95ddFACC150a1695A3Fc606459fd0dE57b91f',
      BptWBTCWETH: '0x110569E3261bC0934dA637b019f6f1b6F50ec574',
      BptBALWETH: '0xad01D8e0Fa9EAA8Fe76dA30CFb1BCe12707aE6c5',
    },
    [eEthereumNetwork.ropsten]: {
    },
    [eEthereumNetwork.main]: {
      DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      UniDAIWETH: '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11',
      UniWBTCWETH: '0xBb2b8038a1640196FbE3e38816F3e67Cba72D940',
      UniAAVEWETH: '0xDFC14d2Af169B0D36C4EFF567Ada9b2E0CAE044f',
      UniBATWETH: '0xB6909B960DbbE7392D405429eB2b3649752b4838',
      UniDAIUSDC: '0xAE461cA67B15dc8dc81CE7615e0320dA1A9aB8D5',
      UniCRVWETH: '0x3dA1313aE46132A397D90d95B1424A9A7e3e0fCE',
      UniLINKWETH: '0xa2107FA5B38d9bbd2C461D6EDf11B11A50F6b974',
      UniMKRWETH: '0xC2aDdA861F89bBB333c90c492cB837741916A225',
      UniRENWETH: '0x8Bd1661Da98EBDd3BD080F0bE4e6d9bE8cE9858c',
      UniSNXWETH: '0x43AE24960e5534731Fc831386c07755A2dc33D47',
      UniUNIWETH: '0xd3d2E2692501A5c9Ca623199D38826e513033a17',
      UniUSDCWETH: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc',
      UniWBTCUSDC: '0x004375Dff511095CC5A197A54140a24eFEF3A416',
      UniYFIWETH: '0x2fDbAdf3C4D5A8666Bc06645B8358ab803996E28',
      BptWBTCWETH: '0x1efF8aF5D577060BA4ac8A29A13525bb0Ee2A3D5',
      BptBALWETH: '0x59A19D8c652FA0284f44113D0ff9aBa70bd46fB4',
    },
    [eEthereumNetwork.tenderlyMain]: {
      DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      UniDAIWETH: '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11',
      UniWBTCWETH: '0xBb2b8038a1640196FbE3e38816F3e67Cba72D940',
      UniAAVEWETH: '0xDFC14d2Af169B0D36C4EFF567Ada9b2E0CAE044f',
      UniBATWETH: '0xB6909B960DbbE7392D405429eB2b3649752b4838',
      UniDAIUSDC: '0xAE461cA67B15dc8dc81CE7615e0320dA1A9aB8D5',
      UniCRVWETH: '0x3dA1313aE46132A397D90d95B1424A9A7e3e0fCE',
      UniLINKWETH: '0xa2107FA5B38d9bbd2C461D6EDf11B11A50F6b974',
      UniMKRWETH: '0xC2aDdA861F89bBB333c90c492cB837741916A225',
      UniRENWETH: '0x8Bd1661Da98EBDd3BD080F0bE4e6d9bE8cE9858c',
      UniSNXWETH: '0x43AE24960e5534731Fc831386c07755A2dc33D47',
      UniUNIWETH: '0xd3d2E2692501A5c9Ca623199D38826e513033a17',
      UniUSDCWETH: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc',
      UniWBTCUSDC: '0x004375Dff511095CC5A197A54140a24eFEF3A416',
      UniYFIWETH: '0x2fDbAdf3C4D5A8666Bc06645B8358ab803996E28',
      BptWBTCWETH: '0x1efF8aF5D577060BA4ac8A29A13525bb0Ee2A3D5',
      BptBALWETH: '0x59A19D8c652FA0284f44113D0ff9aBa70bd46fB4',
    },
  },
};

export default AmmConfig;
