import { ZERO_ADDRESS, MOCK_CHAINLINK_AGGREGATORS_PRICES, oneEther } from '../../helpers/constants';
import { ICommonConfiguration, eEthereumNetwork } from '../../helpers/types';

// ----------------
// PROTOCOL GLOBAL PARAMS
// ----------------

export const CommonsConfig: ICommonConfiguration = {
  MarketId: 'Commons',
  ATokenNamePrefix: 'Sturdy_eth interest bearing',
  StableDebtTokenNamePrefix: 'Sturdy_eth stable debt bearing',
  VariableDebtTokenNamePrefix: 'Sturdy_eth variable debt bearing',
  SymbolPrefix: '',
  ProviderId: 0, // Overridden in index.ts
  OracleQuoteCurrency: 'ETH',
  OracleQuoteUnit: oneEther.toString(),
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
    WETH: {
      borrowRate: '0' /* oneRay.multipliedBy(0.039).toFixed() */,
    },
  },
  // ----------------
  // COMMON PROTOCOL ADDRESSES ACROSS POOLS
  // ----------------

  // If PoolAdmin/emergencyAdmin is set, will take priority over PoolAdminIndex/emergencyAdminIndex
  PoolAdmin: {
    [eEthereumNetwork.main]: undefined,
    [eEthereumNetwork.tenderly]: undefined,
    [eEthereumNetwork.goerli]: undefined,
  },
  PoolAdminIndex: 0,
  EmergencyAdmin: {
    [eEthereumNetwork.main]: undefined,
    [eEthereumNetwork.tenderly]: undefined,
    [eEthereumNetwork.goerli]: undefined,
  },
  EmergencyAdminIndex: 1,
  ProviderRegistry: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  ProviderRegistryOwner: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  LendingRateOracle: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  LendingPoolCollateralManager: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  LendingPoolConfigurator: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  LendingPool: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  TokenDistributor: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  SturdyOracle: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  FallbackOracle: {
    [eEthereumNetwork.main]: ZERO_ADDRESS,
    [eEthereumNetwork.tenderly]: ZERO_ADDRESS,
    [eEthereumNetwork.goerli]: ZERO_ADDRESS,
  },
  ChainlinkAggregator: {
    [eEthereumNetwork.main]: {
      WETH: '',
    },
    [eEthereumNetwork.tenderly]: {
      WETH: '',
    },
    [eEthereumNetwork.goerli]: {
      WETH: '',
    },
  },
  ReserveAssets: {
    [eEthereumNetwork.main]: {},
    [eEthereumNetwork.tenderly]: {},
    [eEthereumNetwork.goerli]: {},
  },
  ReservesConfig: {},
  ATokenDomainSeparator: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  WFTM: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  WETH: {
    [eEthereumNetwork.main]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    [eEthereumNetwork.tenderly]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    [eEthereumNetwork.goerli]: '0x0Bb7509324cE409F7bbC4b701f932eAca9736AB7',
  },
  WBTC: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
    [eEthereumNetwork.goerli]: '',
  },
  WrappedNativeToken: {
    [eEthereumNetwork.main]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    [eEthereumNetwork.tenderly]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    [eEthereumNetwork.goerli]: '0x0Bb7509324cE409F7bbC4b701f932eAca9736AB7',
  },
  ReserveFactorTreasuryAddress: {
    [eEthereumNetwork.main]: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    [eEthereumNetwork.tenderly]: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    [eEthereumNetwork.goerli]: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
  },
  IncentivesController: {
    [eEthereumNetwork.main]: ZERO_ADDRESS,
    [eEthereumNetwork.tenderly]: ZERO_ADDRESS,
    [eEthereumNetwork.goerli]: ZERO_ADDRESS,
  },
};
