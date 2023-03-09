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
  },
  PoolAdminIndex: 0,
  EmergencyAdmin: {
    [eEthereumNetwork.main]: undefined,
    [eEthereumNetwork.tenderly]: undefined,
  },
  EmergencyAdminIndex: 1,
  ProviderRegistry: {
    [eEthereumNetwork.main]: '0x88f8CCC064bA2D39cF08D57B6e7504a7B6bE8E4e',
    [eEthereumNetwork.tenderly]: '0x88f8CCC064bA2D39cF08D57B6e7504a7B6bE8E4e',
  },
  ProviderRegistryOwner: {
    [eEthereumNetwork.main]: '0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc',
    [eEthereumNetwork.tenderly]: '0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc',
  },
  LendingRateOracle: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
  },
  LendingPoolCollateralManager: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
  },
  LendingPoolConfigurator: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
  },
  LendingPool: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
  },
  TokenDistributor: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
  },
  SturdyOracle: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
  },
  FallbackOracle: {
    [eEthereumNetwork.main]: ZERO_ADDRESS,
    [eEthereumNetwork.tenderly]: ZERO_ADDRESS,
  },
  ChainlinkAggregator: {
    [eEthereumNetwork.main]: {
      USD: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
      cvxETH_STETH: '', //'0xD783c7ff0666bb8245229946D595A819f5B21170',
      auraWSTETH_WETH: '', //'0x89a6EB70763cd22ace8Fdb18719d481DDCeEDa06',
      auraRETH_WETH: '',
      CRV: '0x8a12Be339B0cD1829b91Adc01977caa5E9ac121e',
      CVX: '0xC9CbF687f43176B302F03f5e58470b77D07c61c6',
      BAL: '0xC1438AA3823A6Ba0C159CfA8D98dF5A994bA120b',
      AURA: '', //'0x8209BB16a39FD6B76799e7f34702e316cF1129F0',
      LDO: '0x4e844125952d32acdf339be976c98e22f6f318db',
    },
    [eEthereumNetwork.tenderly]: {
      USD: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
      cvxETH_STETH: '0xD783c7ff0666bb8245229946D595A819f5B21170',
      auraWSTETH_WETH: '0x89a6EB70763cd22ace8Fdb18719d481DDCeEDa06',
      auraRETH_WETH: '',
      CRV: '0x8a12Be339B0cD1829b91Adc01977caa5E9ac121e',
      CVX: '0xC9CbF687f43176B302F03f5e58470b77D07c61c6',
      BAL: '0xC1438AA3823A6Ba0C159CfA8D98dF5A994bA120b',
      AURA: '0x8209BB16a39FD6B76799e7f34702e316cF1129F0',
      LDO: '0x4e844125952d32acdf339be976c98e22f6f318db',
    },
  },
  ReserveAssets: {
    [eEthereumNetwork.main]: {},
    [eEthereumNetwork.tenderly]: {},
  },
  ReservesConfig: {},
  ATokenDomainSeparator: {
    [eEthereumNetwork.main]: '',
    [eEthereumNetwork.tenderly]: '',
  },
  WETH: {
    [eEthereumNetwork.main]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    [eEthereumNetwork.tenderly]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  },
  WrappedNativeToken: {
    [eEthereumNetwork.main]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    [eEthereumNetwork.tenderly]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  },
  ReserveFactorTreasuryAddress: {
    [eEthereumNetwork.main]: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    [eEthereumNetwork.tenderly]: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
  },
  IncentivesController: {
    [eEthereumNetwork.main]: ZERO_ADDRESS,
    [eEthereumNetwork.tenderly]: ZERO_ADDRESS,
  },
};
