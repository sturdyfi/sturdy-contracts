import {
  SturdyProtocolDataProviderFactory,
  ATokenFactory,
  ATokensAndRatesHelperFactory,
  SturdyOracleFactory,
  DefaultReserveInterestRateStrategyFactory,
  InitializableImmutableAdminUpgradeabilityProxyFactory,
  LendingPoolAddressesProviderFactory,
  LendingPoolAddressesProviderRegistryFactory,
  LendingPoolCollateralManagerFactory,
  LendingPoolConfiguratorFactory,
  LendingRateOracleFactory,
  ReserveLogicFactory,
  StableAndVariableTokensHelperFactory,
  StableDebtTokenFactory,
  VariableDebtTokenFactory,
  LendingPoolFactory,
  StakedTokenIncentivesControllerFactory,
  SturdyTokenFactory,
  WalletBalanceProviderFactory,
  UiPoolDataProviderFactory,
  UiIncentiveDataProviderFactory,
  ATokenForCollateralFactory,
  CollateralAdapterFactory,
  ETHLiquidatorFactory,
  DeployVaultHelperFactory,
  YieldManagerFactory,
  StableYieldDistributionFactory,
  VariableYieldDistributionFactory,
  LeverageSwapManagerFactory,
  SturdyAPRDataProviderFactory,
  AuraBalancerLPVaultFactory,
  ConvexCurveLPVault2Factory,
  MintableERC20Factory,
} from '../types';
import { IERC20DetailedFactory } from '../types/IERC20DetailedFactory';
import { IWETHFactory } from '../types/IWETHFactory';
import { getEthersSigners } from './contracts-helpers';
import { DRE, getDb, notFalsyOrZeroAddress, omit } from './misc-utils';
import { eContractid, PoolConfiguration, tEthereumAddress, TokenContractId } from './types';

export const getFirstSigner = async () => (await getEthersSigners())[0];

export const getLendingPoolAddressesProvider = async (address?: tEthereumAddress) => {
  return await LendingPoolAddressesProviderFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPoolAddressesProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );
};
export const getLendingPoolConfiguratorProxy = async (address?: tEthereumAddress) => {
  return await LendingPoolConfiguratorFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPoolConfigurator}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );
};

export const getAToken = async (address?: tEthereumAddress) =>
  await ATokenFactory.connect(
    address || (await getDb().get(`${eContractid.AToken}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getATokenForCollateral = async (address?: tEthereumAddress) =>
  await ATokenForCollateralFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ATokenForCollateral}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getStableDebtToken = async (address?: tEthereumAddress) =>
  await StableDebtTokenFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.StableDebtToken}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getVariableDebtToken = async (address?: tEthereumAddress) =>
  await VariableDebtTokenFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.VariableDebtToken}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getMintableERC20 = async (address: tEthereumAddress) =>
  await MintableERC20Factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.MintableERC20}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getIErc20Detailed = async (address: tEthereumAddress) =>
  await IERC20DetailedFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.IERC20Detailed}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getIWETH = async (address: tEthereumAddress) =>
  await IWETHFactory.connect(address, await getFirstSigner());

export const getSturdyProtocolDataProvider = async (address?: tEthereumAddress) =>
  await SturdyProtocolDataProviderFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.SturdyProtocolDataProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getInterestRateStrategy = async (address?: tEthereumAddress) =>
  await DefaultReserveInterestRateStrategyFactory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.DefaultReserveInterestRateStrategy}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getLendingRateOracle = async (address?: tEthereumAddress) =>
  await LendingRateOracleFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingRateOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getQuoteCurrencies = (oracleQuoteCurrency: string): string[] => {
  switch (oracleQuoteCurrency) {
    case 'USD':
      return ['USD'];
    case 'ETH':
    case 'WETH':
    default:
      return ['ETH', 'WETH'];
  }
};

export const getPairsTokenAggregator = (
  allAssetsAddresses: {
    [tokenSymbol: string]: tEthereumAddress;
  },
  aggregatorsAddresses: { [tokenSymbol: string]: tEthereumAddress },
  oracleQuoteCurrency: string
): [string[], string[]] => {
  const assetsWithoutQuoteCurrency = omit(
    allAssetsAddresses,
    getQuoteCurrencies(oracleQuoteCurrency)
  );

  const pairs = Object.entries(assetsWithoutQuoteCurrency)
    .map(([tokenSymbol, tokenAddress]) => {
      //if (true/*tokenSymbol !== 'WETH' && tokenSymbol !== 'ETH' && tokenSymbol !== 'LpWETH'*/) {
      const aggregatorAddressIndex = Object.keys(aggregatorsAddresses).findIndex(
        (value) => value === tokenSymbol
      );
      const [, aggregatorAddress] = (
        Object.entries(aggregatorsAddresses) as [string, tEthereumAddress][]
      )[aggregatorAddressIndex];
      return [tokenAddress, aggregatorAddress];
      //}
    })
    .filter(([tokenAddress, aggregatorsAddresses]) => aggregatorsAddresses) as [string, string][];

  const mappedPairs = pairs.map(([asset]) => asset);
  const mappedAggregators = pairs.map(([, source]) => source);

  return [mappedPairs, mappedAggregators];
};

export const getLendingPoolAddressesProviderRegistry = async (address?: tEthereumAddress) =>
  await LendingPoolAddressesProviderRegistryFactory.connect(
    notFalsyOrZeroAddress(address)
      ? address
      : (
          await getDb()
            .get(`${eContractid.LendingPoolAddressesProviderRegistry}.${DRE.network.name}`)
            .value()
        ).address,
    await getFirstSigner()
  );

export const getReserveLogic = async (address?: tEthereumAddress) =>
  await ReserveLogicFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ReserveLogic}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getStableAndVariableTokensHelper = async (address?: tEthereumAddress) =>
  await StableAndVariableTokensHelperFactory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.StableAndVariableTokensHelper}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getATokensAndRatesHelper = async (address?: tEthereumAddress) =>
  await ATokensAndRatesHelperFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ATokensAndRatesHelper}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getProxy = async (address: tEthereumAddress) =>
  await InitializableImmutableAdminUpgradeabilityProxyFactory.connect(
    address,
    await getFirstSigner()
  );

export const getLendingPoolImpl = async (address?: tEthereumAddress) =>
  await LendingPoolFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPoolImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLendingPoolConfiguratorImpl = async (address?: tEthereumAddress) =>
  await LendingPoolConfiguratorFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPoolConfiguratorImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLendingPoolCollateralManagerImpl = async (address?: tEthereumAddress) =>
  await LendingPoolCollateralManagerFactory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.LendingPoolCollateralManagerImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getLendingPoolCollateralManager = async (address?: tEthereumAddress) =>
  await LendingPoolCollateralManagerFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPoolCollateralManager}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getAddressById = async (id: string): Promise<tEthereumAddress | undefined> =>
  (await getDb().get(`${id}.${DRE.network.name}`).value())?.address || undefined;

export const getSturdyOracle = async (address?: tEthereumAddress) =>
  await SturdyOracleFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.SturdyOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLendingPool = async (address?: tEthereumAddress) =>
  await LendingPoolFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPool}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexETHSTETHVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault2Factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexETHSTETHVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getAuraWSTETHWETHVault = async (address?: tEthereumAddress) =>
  await AuraBalancerLPVaultFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.AuraWSTETHWETHVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getWalletProvider = async (address?: tEthereumAddress) =>
  await WalletBalanceProviderFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.WalletBalanceProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getUiPoolDataProvider = async (address?: tEthereumAddress) =>
  await UiPoolDataProviderFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.UiPoolDataProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getUiIncentiveDataProvider = async (address?: tEthereumAddress) =>
  await UiIncentiveDataProviderFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.UiIncentiveDataProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getSturdyIncentivesControllerImpl = async (address?: tEthereumAddress) =>
  await StakedTokenIncentivesControllerFactory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.StakedTokenIncentivesControllerImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getSturdyIncentivesController = async (address?: tEthereumAddress) =>
  await StakedTokenIncentivesControllerFactory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.StakedTokenIncentivesController}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getSturdyTokenImpl = async (address?: tEthereumAddress) =>
  await SturdyTokenFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.SturdyTokenImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getSturdyToken = async (address?: tEthereumAddress) =>
  await SturdyTokenFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.SturdyToken}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getStableYieldDistributionImpl = async (address?: tEthereumAddress) =>
  await StableYieldDistributionFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.StableYieldDistributionImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getFXSStableYieldDistribution = async (address?: tEthereumAddress) =>
  await StableYieldDistributionFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.FXSStableYieldDistribution}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getVariableYieldDistributionImpl = async (address?: tEthereumAddress) =>
  await VariableYieldDistributionFactory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.VariableYieldDistributionImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getVariableYieldDistribution = async (address?: tEthereumAddress) =>
  await VariableYieldDistributionFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.VariableYieldDistribution}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getCollateralAdapterImpl = async (address?: tEthereumAddress) =>
  await CollateralAdapterFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.CollateralAdapterImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getCollateralAdapter = async (address?: tEthereumAddress) =>
  await CollateralAdapterFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.CollateralAdapter}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getGenericATokenImpl = async (address?: tEthereumAddress) =>
  await ATokenFactory.connect(
    address || (await getDb().get(`${eContractid.AToken}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getCollateralATokenImpl = async (address?: tEthereumAddress) =>
  await ATokenForCollateralFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ATokenForCollateral}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getETHLiquidator = async (address?: tEthereumAddress) =>
  await ETHLiquidatorFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ETHLiquidator}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getDeployVaultHelper = async (address?: tEthereumAddress) =>
  await DeployVaultHelperFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.DeployVaultHelper}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYieldManagerImpl = async (address?: tEthereumAddress) =>
  await YieldManagerFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YieldManagerImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYieldManager = async (address?: tEthereumAddress) =>
  await YieldManagerFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YieldManager}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getUniswapAdapterAddress = async () => {
  const db = await getDb().get(`${eContractid.UniswapAdapter}.${DRE.network.name}`).value();
  return db?.address;
};

export const getCurveswapAdapterAddress = async () => {
  const db = await getDb().get(`${eContractid.CurveswapAdapter}.${DRE.network.name}`).value();
  return db?.address;
};

export const getBalancerswapAdapterAddress = async () => {
  const db = await getDb().get(`${eContractid.BalancerswapAdapter}.${DRE.network.name}`).value();
  return db?.address;
};

export const getLeverageSwapManagerImpl = async (address?: tEthereumAddress) =>
  await LeverageSwapManagerFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LeverageSwapManagerImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLeverageSwapManager = async (address?: tEthereumAddress) =>
  await LeverageSwapManagerFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LeverageSwapManager}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getSturdyAPRDataProvider = async (address?: tEthereumAddress) =>
  await SturdyAPRDataProviderFactory.connect(
    address ||
      (
        await getDb().get(`${eContractid.SturdyAPRDataProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getValidationLogic = async () => {
  const db = await getDb().get(`${eContractid.ValidationLogic}.${DRE.network.name}`).value();
  return db?.address;
};

export const getGenericLogic = async () => {
  const db = await getDb().get(`${eContractid.GenericLogic}.${DRE.network.name}`).value();
  return db?.address;
};

export const getReserveLogicLibrary = async () => {
  const db = await getDb().get(`${eContractid.ReserveLogic}.${DRE.network.name}`).value();
  return db?.address;
};
