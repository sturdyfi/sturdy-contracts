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
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '0xb4B946b1FC176B28C5da6Cf14fe7F116eF51C104',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  ProviderRegistryOwner: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '0x661fB502E24Deb30e927E39A38Bd2CC44D67339F',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  LendingRateOracle: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '0xD7A281A8481E6e208C34914300e4814d5c0d08C4',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  LendingPoolCollateralManager: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '0xA80Ba80cD112BF80bFF78Ba454739f511d6D2240',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  LendingPoolConfigurator: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '0xb174a04487623e7954C4D91cb5fCC4bD79EDDe60',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  LendingPool: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '0x7237348D79053D86b4cDD553462AA1D34050a774',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  TokenDistributor: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  SturdyOracle: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.ftm_test]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  FallbackOracle: {
    [eFantomNetwork.ftm]: ZERO_ADDRESS,
    [eFantomNetwork.ftm_test]: '0xD4B7878729778d5D3F5aD26499584FBC56af096b',
    [eFantomNetwork.tenderlyFTM]: ZERO_ADDRESS,
  },
  ChainlinkAggregator: {
    [eFantomNetwork.ftm]: {
      DAI: '0x91d5DEFAFfE2854C7D02F50c80FA1fdc8A721e52',
      USDC: '0x2553f4eeb82d5A26427b8d1106C51499CBa5D99c',
      fUSDT: '0xF64b636c5dFe1d3555A847341cDC449f612307d0',
      yvWFTM: '0xf4766552D15AE4d256Ad41B6cf2933482B0680dc',
      mooWETH: '0x11ddd3d147e5b83d01cee7070027092397d63658',
    },
    [eFantomNetwork.ftm_test]: {
      DAI: '',
      USDC: '',
      yvWFTM: '',
    },
    [eFantomNetwork.tenderlyFTM]: {
      DAI: '0x91d5DEFAFfE2854C7D02F50c80FA1fdc8A721e52',
      USDC: '0x2553f4eeb82d5A26427b8d1106C51499CBa5D99c',
      fUSDT: '0xF64b636c5dFe1d3555A847341cDC449f612307d0',
      yvWFTM: '0xf4766552D15AE4d256Ad41B6cf2933482B0680dc',
      mooWETH: '0x11ddd3d147e5b83d01cee7070027092397d63658',
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
    [eFantomNetwork.tenderlyFTM]: '0x74b23882a30290451a17c44f4f05243b6b58c76d',
  },
  WrappedNativeToken: {
    [eFantomNetwork.ftm]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    [eFantomNetwork.ftm_test]: '0xf1277d1ed8ad466beddf92ef448a132661956621',
    [eFantomNetwork.tenderlyFTM]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
  },
  ReserveFactorTreasuryAddress: {
    [eFantomNetwork.ftm]: '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60',
    [eFantomNetwork.ftm_test]: '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60',
    [eFantomNetwork.tenderlyFTM]: '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60',
  },
  IncentivesController: {
    [eFantomNetwork.ftm]: ZERO_ADDRESS,
    [eFantomNetwork.ftm_test]: '0x0920Eb8309cbAd2c67521bF98042a3a199b936b8',
    [eFantomNetwork.tenderlyFTM]: ZERO_ADDRESS,
  },
};
