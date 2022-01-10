import {
  ZERO_ADDRESS,
  MOCK_CHAINLINK_AGGREGATORS_PRICES,
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
  },
  // ----------------
  // COMMON PROTOCOL ADDRESSES ACROSS POOLS
  // ----------------

  // If PoolAdmin/emergencyAdmin is set, will take priority over PoolAdminIndex/emergencyAdminIndex
  PoolAdmin: {
    [eFantomNetwork.ftm]: undefined,
    [eFantomNetwork.tenderlyFTM]: undefined,
  },
  PoolAdminIndex: 0,
  EmergencyAdmin: {
    [eFantomNetwork.ftm]: undefined,
    [eFantomNetwork.tenderlyFTM]: undefined,
  },
  EmergencyAdminIndex: 1,
  ProviderRegistry: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  ProviderRegistryOwner: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  LendingRateOracle: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  LendingPoolCollateralManager: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  LendingPoolConfigurator: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  LendingPool: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  TokenDistributor: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  SturdyOracle: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  FallbackOracle: {
    [eFantomNetwork.ftm]: ZERO_ADDRESS,
    [eFantomNetwork.tenderlyFTM]: ZERO_ADDRESS,
  },
  ChainlinkAggregator: {
    [eFantomNetwork.ftm]: {
      DAI: '0x91d5DEFAFfE2854C7D02F50c80FA1fdc8A721e52',
      USDC: '0x2553f4eeb82d5A26427b8d1106C51499CBa5D99c',
    },
    [eFantomNetwork.tenderlyFTM]: {
      DAI: '0x91d5DEFAFfE2854C7D02F50c80FA1fdc8A721e52',
      USDC: '0x2553f4eeb82d5A26427b8d1106C51499CBa5D99c',
    },
  },
  ReserveAssets: {
    [eFantomNetwork.ftm]: {},
    [eFantomNetwork.tenderlyFTM]: {},
  },
  ReservesConfig: {},
  ATokenDomainSeparator: {
    [eFantomNetwork.ftm]: '',
    [eFantomNetwork.tenderlyFTM]: '',
  },
  WETH: {
    [eFantomNetwork.ftm]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    [eFantomNetwork.tenderlyFTM]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
  },
  WrappedNativeToken: {
    [eFantomNetwork.ftm]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    [eFantomNetwork.tenderlyFTM]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
  },
  ReserveFactorTreasuryAddress: {
    [eFantomNetwork.ftm]: '0x464c71f6c2f760dda6093dcb91c24c39e5d6e18c',
    [eFantomNetwork.tenderlyFTM]: '0x464c71f6c2f760dda6093dcb91c24c39e5d6e18c',
  },
  IncentivesController: {
    [eFantomNetwork.ftm]: ZERO_ADDRESS,
    [eFantomNetwork.tenderlyFTM]: ZERO_ADDRESS,
  },
};
