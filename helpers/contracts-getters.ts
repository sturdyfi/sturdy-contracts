import {
  SturdyProtocolDataProvider__factory,
  AToken__factory,
  ATokensAndRatesHelper__factory,
  SturdyOracle__factory,
  DefaultReserveInterestRateStrategy__factory,
  InitializableImmutableAdminUpgradeabilityProxy__factory,
  LendingPoolAddressesProvider__factory,
  LendingPoolAddressesProviderRegistry__factory,
  LendingPoolCollateralManager__factory,
  LendingPoolConfigurator__factory,
  LendingRateOracle__factory,
  MintableERC20__factory,
  MockAToken__factory,
  MockStableDebtToken__factory,
  MockVariableDebtToken__factory,
  PriceOracle__factory,
  ReserveLogic__factory,
  StableAndVariableTokensHelper__factory,
  StableDebtToken__factory,
  VariableDebtToken__factory,
  WETH9Mocked__factory,
  LendingPool__factory,
  LidoVault__factory,
  StakedTokenIncentivesController__factory,
  SturdyToken__factory,
  WalletBalanceProvider__factory,
  UiPoolDataProvider__factory,
  UiIncentiveDataProvider__factory,
  YearnVault__factory,
  BeefyETHVault__factory,
  MockyvWFTM__factory,
  SwapinERC20__factory,
  YearnWETHVault__factory,
  MockyvWETH__factory,
  MockWETHForFTM__factory,
  ATokenForCollateral__factory,
  YearnWBTCVault__factory,
  MockyvWBTC__factory,
  MockWBTCForFTM__factory,
  CollateralAdapter__factory,
  YearnBOOVault__factory,
  BooOracle__factory,
  MockyvBOO__factory,
  TombFtmBeefyVault__factory,
  MockMooTOMBFTM__factory,
  TombOracle__factory,
  TombFtmLPOracle__factory,
  TombMiMaticLPOracle__factory,
  TombMimaticBeefyVault__factory,
  MockMooTOMBMIMATIC__factory,
  FTMLiquidator__factory,
  ETHLiquidator__factory,
  YearnFBEETSVault__factory,
  YearnLINKVault__factory,
  DeployVaultHelper__factory,
  YearnCRVVault__factory,
  YearnSPELLVault__factory,
  BeetsOracle__factory,
  FBeetsOracle__factory,
  BasedOracle__factory,
  BasedMiMaticLPOracle__factory,
  BasedMimaticBeefyVault__factory,
  MockMooBASEDMIMATIC__factory,
  YearnRETHWstETHVault__factory,
  CrvREthWstETHOracle__factory,
  ConvexCurveLPVault__factory,
  YieldManager__factory,
  StableYieldDistribution__factory,
  VariableYieldDistribution__factory,
  BeefyMIM2CRVVault__factory,
  LeverageSwapManager__factory,
  SturdyAPRDataProvider__factory,
  AuraBalancerLPVault__factory,
  VaultWhitelist__factory,
  ConvexCurveLPVault2__factory,
  StaticAToken__factory,
  YieldDistributorAdapter__factory,
  ERC4626Vault__factory,
  ERC4626Router__factory,
} from '../types';
import { IERC20Detailed__factory } from '../types';
import { IWETH__factory } from '../types';
import { getEthersSigners, MockTokenMap } from './contracts-helpers';
import { DRE, getDb, notFalsyOrZeroAddress, omit } from './misc-utils';
import { eContractid, PoolConfiguration, tEthereumAddress, TokenContractId } from './types';

export const getFirstSigner = async () => (await getEthersSigners())[0];

export const getLendingPoolAddressesProvider = async (address?: tEthereumAddress) => {
  return await LendingPoolAddressesProvider__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPoolAddressesProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );
};
export const getLendingPoolConfiguratorProxy = async (address?: tEthereumAddress) => {
  return await LendingPoolConfigurator__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPoolConfigurator}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );
};

export const getPriceOracle = async (address?: tEthereumAddress) =>
  await PriceOracle__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.PriceOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getStaticAToken = async (symbol: string, address?: tEthereumAddress) =>
  await StaticAToken__factory.connect(
    address ||
      (
        await getDb()
          .get(`${symbol + eContractid.StaticAToken}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getAToken = async (address?: tEthereumAddress) =>
  await AToken__factory.connect(
    address || (await getDb().get(`${eContractid.AToken}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getATokenForCollateral = async (address?: tEthereumAddress) =>
  await ATokenForCollateral__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ATokenForCollateral}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getStableDebtToken = async (address?: tEthereumAddress) =>
  await StableDebtToken__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.StableDebtToken}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getVariableDebtToken = async (address?: tEthereumAddress) =>
  await VariableDebtToken__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.VariableDebtToken}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getMintableERC20 = async (address: tEthereumAddress) =>
  await MintableERC20__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.MintableERC20}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getSwapinERC20 = async (address: tEthereumAddress) =>
  await SwapinERC20__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.SwapinERC20}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getIErc20Detailed = async (address: tEthereumAddress) =>
  await IERC20Detailed__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.IERC20Detailed}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getIWETH = async (address: tEthereumAddress) =>
  await IWETH__factory.connect(address, await getFirstSigner());

export const getSturdyProtocolDataProvider = async (address?: tEthereumAddress) =>
  await SturdyProtocolDataProvider__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.SturdyProtocolDataProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getInterestRateStrategy = async (address?: tEthereumAddress) =>
  await DefaultReserveInterestRateStrategy__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.DefaultReserveInterestRateStrategy}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getLendingRateOracle = async (address?: tEthereumAddress) =>
  await LendingRateOracle__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingRateOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getMockedTokens = async (config: PoolConfiguration) => {
  const tokenSymbols = Object.keys(config.ReservesConfig);
  const db = getDb();
  const tokens: MockTokenMap = await tokenSymbols.reduce<Promise<MockTokenMap>>(
    async (acc, tokenSymbol) => {
      const accumulator = await acc;
      const address = db.get(`${tokenSymbol.toUpperCase()}.${DRE.network.name}`).value().address;
      accumulator[tokenSymbol] = await getMintableERC20(address);
      return Promise.resolve(acc);
    },
    Promise.resolve({})
  );
  return tokens;
};

export const getAllMockedTokens = async () => {
  const db = getDb();
  const tokens: MockTokenMap = await Object.keys(TokenContractId).reduce<Promise<MockTokenMap>>(
    async (acc, tokenSymbol) => {
      const accumulator = await acc;
      const address = db.get(`${tokenSymbol.toUpperCase()}.${DRE.network.name}`).value().address;
      accumulator[tokenSymbol] = await getMintableERC20(address);
      return Promise.resolve(acc);
    },
    Promise.resolve({})
  );
  return tokens;
};

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
  await LendingPoolAddressesProviderRegistry__factory.connect(
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
  await ReserveLogic__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ReserveLogic}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getStableAndVariableTokensHelper = async (address?: tEthereumAddress) =>
  await StableAndVariableTokensHelper__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.StableAndVariableTokensHelper}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getATokensAndRatesHelper = async (address?: tEthereumAddress) =>
  await ATokensAndRatesHelper__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ATokensAndRatesHelper}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getWETHMocked = async (address?: tEthereumAddress) =>
  await WETH9Mocked__factory.connect(
    address || (await getDb().get(`${eContractid.WETHMocked}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getMockAToken = async (address?: tEthereumAddress) =>
  await MockAToken__factory.connect(
    address || (await getDb().get(`${eContractid.MockAToken}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getMockVariableDebtToken = async (address?: tEthereumAddress) =>
  await MockVariableDebtToken__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.MockVariableDebtToken}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getMockStableDebtToken = async (address?: tEthereumAddress) =>
  await MockStableDebtToken__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.MockStableDebtToken}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getProxy = async (address: tEthereumAddress) =>
  await InitializableImmutableAdminUpgradeabilityProxy__factory.connect(
    address,
    await getFirstSigner()
  );

export const getLendingPoolImpl = async (address?: tEthereumAddress) =>
  await LendingPool__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPoolImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLendingPoolConfiguratorImpl = async (address?: tEthereumAddress) =>
  await LendingPoolConfigurator__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPoolConfiguratorImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLendingPoolCollateralManagerImpl = async (address?: tEthereumAddress) =>
  await LendingPoolCollateralManager__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.LendingPoolCollateralManagerImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getLendingPoolCollateralManager = async (address?: tEthereumAddress) =>
  await LendingPoolCollateralManager__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPoolCollateralManager}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getAddressById = async (id: string): Promise<tEthereumAddress | undefined> =>
  (await getDb().get(`${id}.${DRE.network.name}`).value())?.address || undefined;

export const getSturdyOracle = async (address?: tEthereumAddress) =>
  await SturdyOracle__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.SturdyOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getBooOracle = async (address?: tEthereumAddress) =>
  await BooOracle__factory.connect(
    address || (await getDb().get(`${eContractid.BooOracle}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getTombOracle = async (address?: tEthereumAddress) =>
  await TombOracle__factory.connect(
    address || (await getDb().get(`${eContractid.TombOracle}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getTombFtmLPOracle = async (address?: tEthereumAddress) =>
  await TombFtmLPOracle__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.TombFtmLPOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getTombMiMaticLPOracle = async (address?: tEthereumAddress) =>
  await TombMiMaticLPOracle__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.TombMiMaticLPOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getBasedOracle = async (address?: tEthereumAddress) =>
  await BasedOracle__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.BasedOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getBasedMiMaticLPOracle = async (address?: tEthereumAddress) =>
  await BasedMiMaticLPOracle__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.BasedMiMaticLPOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLendingPool = async (address?: tEthereumAddress) =>
  await LendingPool__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LendingPool}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLidoVaultImpl = async (address?: tEthereumAddress) =>
  await LidoVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LidoVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLidoVault = async (address?: tEthereumAddress) =>
  await LidoVault__factory.connect(
    address || (await getDb().get(`${eContractid.LidoVault}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getYearnRETHWstETHVaultImpl = async (address?: tEthereumAddress) =>
  await YearnRETHWstETHVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnRETHWstETHVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnRETHWstETHVault = async (address?: tEthereumAddress) =>
  await YearnRETHWstETHVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnRETHWstETHVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexRocketPoolETHVaultImpl = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ConvexRocketPoolETHVaulttImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getConvexRocketPoolETHVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexRocketPoolETHVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexFRAX3CRVVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexFRAX3CRVVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexSTETHVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexSTETHVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexDOLA3CRVVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexDOLA3CRVVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexMIM3CRVVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexMIM3CRVVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexDAIUSDCUSDTSUSDVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexDAIUSDCUSDTSUSDVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexHBTCWBTCVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexHBTCWBTCVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexIronBankVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexIronBankVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexFRAXUSDCVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexFRAXUSDCVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getAuraDAIUSDCUSDTVault = async (address?: tEthereumAddress) =>
  await AuraBalancerLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.AuraDAIUSDCUSDTVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getConvexTUSDFRAXBPVault = async (address?: tEthereumAddress) =>
  await ConvexCurveLPVault2__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ConvexTUSDFRAXBPVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getAuraBBAUSDVault = async (address?: tEthereumAddress) =>
  await AuraBalancerLPVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.AuraBBAUSDVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnVaultImpl = async (address?: tEthereumAddress) =>
  await YearnVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnVault = async (address?: tEthereumAddress) =>
  await YearnVault__factory.connect(
    address || (await getDb().get(`${eContractid.YearnVault}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getYearnWETHVaultImpl = async (address?: tEthereumAddress) =>
  await YearnWETHVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnWETHVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnWETHVault = async (address?: tEthereumAddress) =>
  await YearnWETHVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnWETHVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnWBTCVaultImpl = async (address?: tEthereumAddress) =>
  await YearnWBTCVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnWBTCVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnWBTCVault = async (address?: tEthereumAddress) =>
  await YearnWBTCVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnWBTCVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnBOOVaultImpl = async (address?: tEthereumAddress) =>
  await YearnBOOVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnBOOVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnBOOVault = async (address?: tEthereumAddress) =>
  await YearnBOOVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnBOOVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getTombFtmBeefyVaultImpl = async (address?: tEthereumAddress) =>
  await TombFtmBeefyVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.TombFtmBeefyVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getTombFtmBeefyVault = async (address?: tEthereumAddress) =>
  await TombFtmBeefyVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.TombFtmBeefyVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getTombMiMaticBeefyVaultImpl = async (address?: tEthereumAddress) =>
  await TombMimaticBeefyVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.TombMiMaticBeefyVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getTombMiMaticBeefyVault = async (address?: tEthereumAddress) =>
  await TombMimaticBeefyVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.TombMiMaticBeefyVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getBasedMiMaticBeefyVaultImpl = async (address?: tEthereumAddress) =>
  await BasedMimaticBeefyVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.BasedMiMaticBeefyVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getBasedMiMaticBeefyVault = async (address?: tEthereumAddress) =>
  await BasedMimaticBeefyVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.BasedMiMaticBeefyVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getBeefyMIM2CRVVaultImpl = async (address?: tEthereumAddress) =>
  await BeefyMIM2CRVVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.BeefyMIM2CRVVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getBeefyMIM2CRVVault = async (address?: tEthereumAddress) =>
  await BeefyMIM2CRVVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.BeefyMIM2CRVVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnFBEETSVaultImpl = async (address?: tEthereumAddress) =>
  await YearnFBEETSVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnFBEETSVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnFBEETSVault = async (address?: tEthereumAddress) =>
  await YearnFBEETSVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnFBEETSVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnLINKVaultImpl = async (address?: tEthereumAddress) =>
  await YearnLINKVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnLINKVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnLINKVault = async (address?: tEthereumAddress) =>
  await YearnLINKVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnLINKVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getBeefyETHVault = async (address?: tEthereumAddress) =>
  await BeefyETHVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.BeefyETHVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnCRVVaultImpl = async (address?: tEthereumAddress) =>
  await YearnCRVVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnCRVVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnCRVVault = async (address?: tEthereumAddress) =>
  await YearnCRVVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnCRVVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnSPELLVaultImpl = async (address?: tEthereumAddress) =>
  await YearnSPELLVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnSPELLVaultImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYearnSPELLVault = async (address?: tEthereumAddress) =>
  await YearnSPELLVault__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YearnSPELLVault}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getWalletProvider = async (address?: tEthereumAddress) =>
  await WalletBalanceProvider__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.WalletBalanceProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getUiPoolDataProvider = async (address?: tEthereumAddress) =>
  await UiPoolDataProvider__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.UiPoolDataProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getUiIncentiveDataProvider = async (address?: tEthereumAddress) =>
  await UiIncentiveDataProvider__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.UiIncentiveDataProvider}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getSturdyIncentivesControllerImpl = async (address?: tEthereumAddress) =>
  await StakedTokenIncentivesController__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.StakedTokenIncentivesControllerImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getSturdyIncentivesController = async (address?: tEthereumAddress) =>
  await StakedTokenIncentivesController__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.StakedTokenIncentivesController}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getSturdyTokenImpl = async (address?: tEthereumAddress) =>
  await SturdyToken__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.SturdyTokenImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getSturdyToken = async (address?: tEthereumAddress) =>
  await SturdyToken__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.SturdyToken}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getStableYieldDistributionImpl = async (address?: tEthereumAddress) =>
  await StableYieldDistribution__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.StableYieldDistributionImpl}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getLDOStableYieldDistribution = async (address?: tEthereumAddress) =>
  await StableYieldDistribution__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LDOStableYieldDistribution}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getVariableYieldDistributionImpl = async (address?: tEthereumAddress) =>
  await VariableYieldDistribution__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.VariableYieldDistributionImpl}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getVariableYieldDistribution = async (address?: tEthereumAddress) =>
  await VariableYieldDistribution__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.VariableYieldDistribution}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYieldDistributorAdapter = async (address?: tEthereumAddress) =>
  await YieldDistributorAdapter__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.YieldDistributorAdapter}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getCollateralAdapter = async (address?: tEthereumAddress) =>
  await CollateralAdapter__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.CollateralAdapter}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getMockyvWFTM = async (address?: tEthereumAddress) =>
  await MockyvWFTM__factory.connect(
    address || (await getDb().get(`${eContractid.MockyvWFTM}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getMockyvWETH = async (address?: tEthereumAddress) =>
  await MockyvWETH__factory.connect(
    address || (await getDb().get(`${eContractid.MockyvWETH}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getMockyvWBTC = async (address?: tEthereumAddress) =>
  await MockyvWBTC__factory.connect(
    address || (await getDb().get(`${eContractid.MockyvWBTC}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getMockyvBOO = async (address?: tEthereumAddress) =>
  await MockyvBOO__factory.connect(
    address || (await getDb().get(`${eContractid.MockyvBOO}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getMockMooTOMBFTM = async (address?: tEthereumAddress) =>
  await MockMooTOMBFTM__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.MockMooTOMBFTM}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getMockMooTOMBMIMATIC = async (address?: tEthereumAddress) =>
  await MockMooTOMBMIMATIC__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.MockMooTOMBMIMATIC}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getMockMooBASEDMIMATIC = async (address?: tEthereumAddress) =>
  await MockMooBASEDMIMATIC__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.MockMooBASEDMIMATIC}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getMockWBTCForFTM = async (address?: tEthereumAddress) =>
  await MockWBTCForFTM__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.MockWBTCForFTM}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getGenericATokenImpl = async (address?: tEthereumAddress) =>
  await AToken__factory.connect(
    address || (await getDb().get(`${eContractid.AToken}.${DRE.network.name}`).value()).address,
    await getFirstSigner()
  );

export const getCollateralATokenImpl = async (address?: tEthereumAddress) =>
  await ATokenForCollateral__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ATokenForCollateral}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getFTMLiquidator = async (address?: tEthereumAddress) =>
  await FTMLiquidator__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.FTMLiquidator}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getETHLiquidator = async (address?: tEthereumAddress) =>
  await ETHLiquidator__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ETHLiquidator}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getDeployVaultHelper = async (address?: tEthereumAddress) =>
  await DeployVaultHelper__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.DeployVaultHelper}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getBeetsOracle = async (address?: tEthereumAddress) =>
  await BeetsOracle__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.BeetsOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getFBeetsOracle = async (address?: tEthereumAddress) =>
  await FBeetsOracle__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.FBeetsOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getRETHWstETHLPOracle = async (address?: tEthereumAddress) =>
  await CrvREthWstETHOracle__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.RETHWstETHLPOracle}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getYieldManager = async (address?: tEthereumAddress) =>
  await YieldManager__factory.connect(
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

export const getLeverageSwapManager = async (address?: tEthereumAddress) =>
  await LeverageSwapManager__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.LeverageSwapManager}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getSturdyAPRDataProvider = async (address?: tEthereumAddress) =>
  await SturdyAPRDataProvider__factory.connect(
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

export const getVaultWhitelist = async (address?: tEthereumAddress) =>
  await VaultWhitelist__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.VaultWhitelist}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );

export const getERC4626Vault = async (assetSymbol: string, address?: tEthereumAddress) =>
  await ERC4626Vault__factory.connect(
    address ||
      (
        await getDb()
          .get(`${eContractid.ERC4626Vault + assetSymbol.toUpperCase()}.${DRE.network.name}`)
          .value()
      ).address,
    await getFirstSigner()
  );

export const getERC4626Router = async (address?: tEthereumAddress) =>
  await ERC4626Router__factory.connect(
    address ||
      (
        await getDb().get(`${eContractid.ERC4626Router}.${DRE.network.name}`).value()
      ).address,
    await getFirstSigner()
  );
