import {
  ZERO_ADDRESS,
  MOCK_CHAINLINK_AGGREGATORS_PRICES,
  oneUsd,
} from '../../helpers/constants';
import { ICommonConfiguration, eFantomNetwork } from '../../helpers/types';

// ----------------
// PROTOCOL GLOBAL PARAMS
// ----------------

export const CommonsConfig: ICommonConfiguration = {
  MarketId: 'Commons',
  ATokenNamePrefix: 'Sturdy interest bearing',
  StableDebtTokenNamePrefix: 'Sturdy stable debt bearing',
  VariableDebtTokenNamePrefix: 'Sturdy variable debt bearing',
  SymbolPrefix: '',
  ProviderId: 0, // Overriden in index.ts
  OracleQuoteCurrency: 'USD',
  OracleQuoteUnit: oneUsd.toString(),
  ProtocolGlobalParams: {
    TokenDistributorPercentageBase: '10000',
    MockUsdPriceInWei: '373068412860',
    UsdAddress: '0x10F7Fc1F91Ba351f9C629c5947AD69bD03C05b96',
    NilAddress: '0x0000000000000000000000000000000000000000',
    OneAddress: '0x0000000000000000000000000000000000000001',
    SturdyReferral: '0',
  },

  // ----------------
  // COMMON PROTOCOL PARAMS ACROSS POOLS AND NETWORKS
  // ----------------

  Mocks: {
    AllAssetsInitialPrices: {
      ...MOCK_CHAINLINK_AGGREGATORS_PRICES,
    },
  },
  // TODO: reorg alphabetically, checking the reason of tests failing
  LendingRateOracleRatesCommon: {
    DAI: {
      borrowRate: '0' /* oneRay.multipliedBy(0.039).toFixed() */,
    },
    USDC: {
      borrowRate: '0' /*oneRay.multipliedBy(0.039).toFixed() */,
    },
    fUSDT: {
      borrowRate: '0' /*oneRay.multipliedBy(0.039).toFixed() */,
    },
  },
  // ----------------
  // COMMON PROTOCOL ADDRESSES ACROSS POOLS
  // ----------------

  // If PoolAdmin/emergencyAdmin is set, will take priority over PoolAdminIndex/emergencyAdminIndex
  PoolAdmin: {
    [eFantomNetwork.ftm]: undefined,
    [eFantomNetwork.ftm_test]: undefined,
    [eFantomNetwork.tenderlyFTM]: undefined,
  },
  PoolAdminIndex: 0,
  EmergencyAdmin: {
    [eFantomNetwork.ftm]: undefined,
    [eFantomNetwork.ftm_test]: undefined,
    [eFantomNetwork.tenderlyFTM]: undefined,
  },
  EmergencyAdminIndex: 1,
  ProviderRegistry: {
    [eFantomNetwork.ftm]: '', //'0x23Df30FE1d2a8C6f4602db382D727561097F899E',
    [eFantomNetwork.ftm_test]: '0xAD475FfbCB15fbc1D481ffDf16dBe5f6ac209Bca',
    [eFantomNetwork.tenderlyFTM]: '0x23Df30FE1d2a8C6f4602db382D727561097F899E',
  },
  ProviderRegistryOwner: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '0x661fB502E24Deb30e927E39A38Bd2CC44D67339F',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  LendingRateOracle: {
    [eFantomNetwork.ftm]: '',//'0x0024a128CB74FF0C93de1261C59E4d04321E9dC0',
    [eFantomNetwork.ftm_test]: '0x829223FB97E0fB5aecFbfD7167aEAe4ec9e0dc75',
    [eFantomNetwork.tenderlyFTM]: '0x0024a128CB74FF0C93de1261C59E4d04321E9dC0',
  },
  LendingPoolCollateralManager: {
    [eFantomNetwork.ftm]: '',//'0x174110e39F1B67a185C9440B980d799AE5332795',
    [eFantomNetwork.ftm_test]: '0x5a3aE44704D95CcAffe608c808308c850bDec94d',
    [eFantomNetwork.tenderlyFTM]: '0x174110e39F1B67a185C9440B980d799AE5332795',
  },
  LendingPoolConfigurator: {
    [eFantomNetwork.ftm]: '',//'0x72D2ADBD98e03Cd1eA05C133142DDFec0Aa26A6d',
    [eFantomNetwork.ftm_test]: '0x6719B46ee295208911f5241f429fDD9F5D88df86',
    [eFantomNetwork.tenderlyFTM]: '0x72D2ADBD98e03Cd1eA05C133142DDFec0Aa26A6d',
  },
  LendingPool: {
    [eFantomNetwork.ftm]: '',//'0x7FF2520Cd7b76e8C49B5DB51505b842d665f3e9A',
    [eFantomNetwork.ftm_test]: '0x7b07169cCB3CcEe717498e1Cefe6049De02f588D',
    [eFantomNetwork.tenderlyFTM]: '0x7FF2520Cd7b76e8C49B5DB51505b842d665f3e9A',
  },
  TokenDistributor: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  SturdyOracle: {
    [eFantomNetwork.ftm]: '',//'0xE84fD77E8B7bB52a71087653a26d6CC6448fb77D',
    [eFantomNetwork.ftm_test]: '',
    [eFantomNetwork.tenderlyFTM]: '0xE84fD77E8B7bB52a71087653a26d6CC6448fb77D',
  },
  FallbackOracle: {
    [eFantomNetwork.ftm]: ZERO_ADDRESS,
    [eFantomNetwork.ftm_test]: '0x40aF3dF2B582a9055FbFAdD57f504B334218c2CD',
    [eFantomNetwork.tenderlyFTM]: ZERO_ADDRESS,
  },
  ChainlinkAggregator: {
    [eFantomNetwork.ftm]: {
      DAI: '0x91d5DEFAFfE2854C7D02F50c80FA1fdc8A721e52',
      USDC: '0x2553f4eeb82d5A26427b8d1106C51499CBa5D99c',
      fUSDT: '0xF64b636c5dFe1d3555A847341cDC449f612307d0',
      yvWFTM: '0xf4766552D15AE4d256Ad41B6cf2933482B0680dc',
      // mooWETH: '0x11ddd3d147e5b83d01cee7070027092397d63658',
      yvWETH: '0x11ddd3d147e5b83d01cee7070027092397d63658',
      yvWBTC: '0x8e94C22142F4A64b99022ccDd994f4e9EC86E4B4',
      yvBOO: '0x4aD9884E676ee2a3F71eC9847C01B4e7755669e8',
      TOMB: '0xa60811d6398EFaCa83D45F58C733EE7C3C4f0e1e',
      MIMATIC: '0x827863222c9C603960dE6FF2c0dD58D457Dcc363',
      mooTOMB_FTM: '0x6dB13c9fcEc2D7AE996bb2220d13aa9274005219',
      mooTOMB_MIMATIC: ''
    },
    [eFantomNetwork.ftm_test]: {},
    [eFantomNetwork.tenderlyFTM]: {
      DAI: '0x91d5DEFAFfE2854C7D02F50c80FA1fdc8A721e52',
      USDC: '0x2553f4eeb82d5A26427b8d1106C51499CBa5D99c',
      fUSDT: '0xF64b636c5dFe1d3555A847341cDC449f612307d0',
      yvWFTM: '0xf4766552D15AE4d256Ad41B6cf2933482B0680dc',
      // mooWETH: '0x11ddd3d147e5b83d01cee7070027092397d63658',
      yvWETH: '0x11ddd3d147e5b83d01cee7070027092397d63658',
      yvWBTC: '0x8e94C22142F4A64b99022ccDd994f4e9EC86E4B4',
      yvBOO: '0x4aD9884E676ee2a3F71eC9847C01B4e7755669e8',
      TOMB: '0xa60811d6398EFaCa83D45F58C733EE7C3C4f0e1e',
      MIMATIC: '0x827863222c9C603960dE6FF2c0dD58D457Dcc363',
      mooTOMB_FTM: '0x6dB13c9fcEc2D7AE996bb2220d13aa9274005219',
      mooTOMB_MIMATIC: ''
    },
  },
  ReserveAssets: {
    [eFantomNetwork.ftm]: {},
    [eFantomNetwork.ftm_test]: {},
    [eFantomNetwork.tenderlyFTM]: {},
  },
  ReservesConfig: {},
  ATokenDomainSeparator: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  WFTM: {
    [eFantomNetwork.ftm]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    [eFantomNetwork.ftm_test]: '0xf1277d1ed8ad466beddf92ef448a132661956621',
    [eFantomNetwork.tenderlyFTM]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
  },
  WETH: {
    [eFantomNetwork.ftm]: '0x74b23882a30290451a17c44f4f05243b6b58c76d',
    [eFantomNetwork.ftm_test]: '0x4135c251eE7804A73dB09D36C306AE0214deA28B',
    [eFantomNetwork.tenderlyFTM]: '0x74b23882a30290451a17c44f4f05243b6b58c76d',
  },
  WBTC: {
    [eFantomNetwork.ftm]: '0x321162Cd933E2Be498Cd2267a90534A804051b11',
    [eFantomNetwork.ftm_test]: '0x0e9Cbd91546F290b0F99cF62DAC637B33D22D9B6',
    [eFantomNetwork.tenderlyFTM]: '0x321162Cd933E2Be498Cd2267a90534A804051b11',
  },
  WrappedNativeToken: {
    [eFantomNetwork.ftm]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    [eFantomNetwork.ftm_test]: '0xf1277d1ed8ad466beddf92ef448a132661956621',
    [eFantomNetwork.tenderlyFTM]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
  },
  ReserveFactorTreasuryAddress: {
    [eFantomNetwork.ftm]: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    [eFantomNetwork.ftm_test]: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    [eFantomNetwork.tenderlyFTM]: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
  },
  IncentivesController: {
    [eFantomNetwork.ftm]: '0xcdA2B5Cd654be0DBA19E4064c583642741712560',
    [eFantomNetwork.ftm_test]: '0xe8257438ea046A3f5f246c862Efd8c96AD82289a',
    [eFantomNetwork.tenderlyFTM]: '0xcdA2B5Cd654be0DBA19E4064c583642741712560',
  },
};
