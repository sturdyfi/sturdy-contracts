import { BigNumberish, Contract } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from './misc-utils';
import {
  tEthereumAddress,
  eContractid,
  tStringTokenSmallUnits,
  SturdyPools,
  TokenContractId,
  iMultiPoolsAssets,
  IReserveParams,
  PoolConfiguration,
  ISturdyConfiguration,
  eEthereumNetwork,
  eNetwork,
  IFantomConfiguration,
} from './types';
import { MintableERC20 } from '../types/MintableERC20';
import { MockContract } from 'ethereum-waffle';
import { ConfigNames, getReservesConfigByPool, loadPoolConfig } from './configuration';
import {
  getCollateralAdapter,
  // getBeefyVault,
  getFirstSigner,
  getLendingPool,
  getLendingPoolAddressesProvider,
  getLidoVault,
  getSturdyIncentivesController,
  getSturdyToken,
  getTombFtmBeefyVault,
  getTombMiMaticBeefyVault,
  getYearnBOOVault,
  getYearnVault,
  getYearnWBTCVault,
  getYearnWETHVault,
} from './contracts-getters';
import { ZERO_ADDRESS } from './constants';
import {
  SturdyProtocolDataProviderFactory,
  ATokenFactory,
  ATokensAndRatesHelperFactory,
  SturdyOracleFactory,
  DefaultReserveInterestRateStrategyFactory,
  LendingPoolAddressesProviderFactory,
  LendingPoolAddressesProviderRegistryFactory,
  LendingPoolCollateralManagerFactory,
  LendingPoolConfiguratorFactory,
  LendingRateOracleFactory,
  MintableDelegationERC20Factory,
  MintableERC20Factory,
  MockAggregatorFactory,
  MockATokenFactory,
  MockStableDebtTokenFactory,
  MockVariableDebtTokenFactory,
  PriceOracleFactory,
  ReserveLogicFactory,
  StableDebtTokenFactory,
  VariableDebtTokenFactory,
  WETH9MockedFactory,
  LendingPoolFactory,
  LidoVaultFactory,
  StakedTokenIncentivesControllerFactory,
  SturdyTokenFactory,
  UiPoolDataProvider,
  WalletBalanceProviderFactory,
  UiIncentiveDataProviderFactory,
  DaiFactory,
  ATokenForCollateralFactory,
  YearnVaultFactory,
  BeefyVaultFactory,
  MockyvWFTMFactory,
  UsdcFactory,
  UsdtFactory,
  YearnWETHVaultFactory,
  MockyvWETHFactory,
  MockWETHForFTMFactory,
  YearnWBTCVaultFactory,
  MockyvWBTCFactory,
  MockWBTCForFTMFactory,
  CollateralAdapterFactory,
  YearnBOOVaultFactory,
  BooOracleFactory,
  MockyvBOOFactory,
  MockBOOForFTMFactory,
  TombOracleFactory,
  TombFtmLPOracleFactory,
  TombFtmBeefyVaultFactory,
  MockMooTOMBFTMFactory,
  MiMaticOracleFactory,
  TombMiMaticLPOracleFactory,
  TombMimaticBeefyVaultFactory,
  MockMooTOMBMIMATICFactory,
} from '../types';
import {
  withSaveAndVerify,
  registerContractInJsonDb,
  linkBytecode,
  insertContractAddressInDb,
  getParamPerNetwork,
  deployContract,
  verifyContract,
} from './contracts-helpers';
import { StableAndVariableTokensHelperFactory } from '../types/StableAndVariableTokensHelperFactory';
import { MintableDelegationERC20 } from '../types/MintableDelegationERC20';
import { readArtifact as buidlerReadArtifact } from '@nomiclabs/buidler/plugins';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { LendingPoolLibraryAddresses } from '../types/LendingPoolFactory';
import BigNumber from 'bignumber.js';

const readArtifact = async (id: string) => {
  if (DRE.network.name === eEthereumNetwork.buidlerevm) {
    return buidlerReadArtifact(DRE.config.paths.artifacts, id);
  }
  return (DRE as HardhatRuntimeEnvironment).artifacts.readArtifact(id);
};

export const deployLendingPoolAddressesProvider = async (marketId: string, verify?: boolean) =>
  withSaveAndVerify(
    await new LendingPoolAddressesProviderFactory(await getFirstSigner()).deploy(marketId),
    eContractid.LendingPoolAddressesProvider,
    [marketId],
    verify
  );

export const deployLendingPoolAddressesProviderRegistry = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LendingPoolAddressesProviderRegistryFactory(await getFirstSigner()).deploy(),
    eContractid.LendingPoolAddressesProviderRegistry,
    [],
    verify
  );

export const deployLendingPoolConfiguratorImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LendingPoolConfiguratorFactory(await getFirstSigner()).deploy(),
    eContractid.LendingPoolConfiguratorImpl,
    [],
    verify
  );

export const deployLendingPoolConfigurator = async (verify?: boolean) => {
  const lendingPoolConfiguratorImpl = await new LendingPoolConfiguratorFactory(
    await getFirstSigner()
  ).deploy();
  await insertContractAddressInDb(
    eContractid.LendingPoolConfiguratorImpl,
    lendingPoolConfiguratorImpl.address
  );
  return withSaveAndVerify(
    lendingPoolConfiguratorImpl,
    eContractid.LendingPoolConfigurator,
    [],
    verify
  );
};

export const deployReserveLogicLibrary = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ReserveLogicFactory(await getFirstSigner()).deploy(),
    eContractid.ReserveLogic,
    [],
    verify
  );

export const deployGenericLogic = async (reserveLogic: Contract, verify?: boolean) => {
  const genericLogicArtifact = await readArtifact(eContractid.GenericLogic);

  const linkedGenericLogicByteCode = linkBytecode(genericLogicArtifact, {
    [eContractid.ReserveLogic]: reserveLogic.address,
  });

  const genericLogicFactory = await DRE.ethers.getContractFactory(
    genericLogicArtifact.abi,
    linkedGenericLogicByteCode
  );

  const genericLogic = await (
    await genericLogicFactory.connect(await getFirstSigner()).deploy()
  ).deployed();
  return withSaveAndVerify(genericLogic, eContractid.GenericLogic, [], verify);
};

export const deployValidationLogic = async (
  reserveLogic: Contract,
  genericLogic: Contract,
  verify?: boolean
) => {
  const validationLogicArtifact = await readArtifact(eContractid.ValidationLogic);

  const linkedValidationLogicByteCode = linkBytecode(validationLogicArtifact, {
    [eContractid.ReserveLogic]: reserveLogic.address,
    [eContractid.GenericLogic]: genericLogic.address,
  });

  const validationLogicFactory = await DRE.ethers.getContractFactory(
    validationLogicArtifact.abi,
    linkedValidationLogicByteCode
  );

  const validationLogic = await (
    await validationLogicFactory.connect(await getFirstSigner()).deploy()
  ).deployed();

  return withSaveAndVerify(validationLogic, eContractid.ValidationLogic, [], verify);
};

export const deploySturdyLibraries = async (
  verify?: boolean
): Promise<LendingPoolLibraryAddresses> => {
  const reserveLogic = await deployReserveLogicLibrary(verify);
  const genericLogic = await deployGenericLogic(reserveLogic, verify);
  const validationLogic = await deployValidationLogic(reserveLogic, genericLogic, verify);

  // Hardcoded solidity placeholders, if any library changes path this will fail.
  // The '__$PLACEHOLDER$__ can be calculated via solidity keccak, but the LendingPoolLibraryAddresses Type seems to
  // require a hardcoded string.
  //
  //  how-to:
  //  1. PLACEHOLDER = solidityKeccak256(['string'], `${libPath}:${libName}`).slice(2, 36)
  //  2. LIB_PLACEHOLDER = `__$${PLACEHOLDER}$__`
  // or grab placeholdes from LendingPoolLibraryAddresses at Typechain generation.
  //
  // libPath example: contracts/libraries/logic/GenericLogic.sol
  // libName example: GenericLogic
  return {
    ['__$de8c0cf1a7d7c36c802af9a64fb9d86036$__']: validationLogic.address,
    ['__$22cd43a9dda9ce44e9b92ba393b88fb9ac$__']: reserveLogic.address,
  };
};

export const deployLendingPoolImpl = async (verify?: boolean) => {
  const libraries = await deploySturdyLibraries(verify);
  const lendingPoolImpl = await new LendingPoolFactory(libraries, await getFirstSigner()).deploy();
  await insertContractAddressInDb(eContractid.LendingPoolImpl, lendingPoolImpl.address);
  return lendingPoolImpl;
};

export const deployLendingPool = async (verify?: boolean) => {
  const libraries = await deploySturdyLibraries(verify);
  const lendingPoolImpl = await new LendingPoolFactory(libraries, await getFirstSigner()).deploy();
  await insertContractAddressInDb(eContractid.LendingPoolImpl, lendingPoolImpl.address);
  return withSaveAndVerify(lendingPoolImpl, eContractid.LendingPool, [], verify);
};

export const deployPriceOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new PriceOracleFactory(await getFirstSigner()).deploy(),
    eContractid.PriceOracle,
    [],
    verify
  );

export const deployLendingRateOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LendingRateOracleFactory(await getFirstSigner()).deploy(),
    eContractid.LendingRateOracle,
    [],
    verify
  );

export const deployMockAggregator = async (price: tStringTokenSmallUnits, verify?: boolean) =>
  withSaveAndVerify(
    await new MockAggregatorFactory(await getFirstSigner()).deploy(price),
    eContractid.MockAggregator,
    [price],
    verify
  );

export const deploySturdyOracle = async (
  args: [tEthereumAddress[], tEthereumAddress[], tEthereumAddress, tEthereumAddress, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new SturdyOracleFactory(await getFirstSigner()).deploy(...args),
    eContractid.SturdyOracle,
    args,
    verify
  );

export const deployBooOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BooOracleFactory(await getFirstSigner()).deploy(),
    eContractid.BooOracle,
    [],
    verify
  );

export const deployTombOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new TombOracleFactory(await getFirstSigner()).deploy(),
    eContractid.TombOracle,
    [],
    verify
  );

export const deployTombFtmLPOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new TombFtmLPOracleFactory(await getFirstSigner()).deploy(),
    eContractid.TombFtmLPOracle,
    [],
    verify
  );

export const deployMiMaticOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new MiMaticOracleFactory(await getFirstSigner()).deploy(),
    eContractid.MiMaticOracle,
    [],
    verify
  );

export const deployTombMiMaticLPOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new TombMiMaticLPOracleFactory(await getFirstSigner()).deploy(),
    eContractid.TombMiMaticLPOracle,
    [],
    verify
  );

export const deployLendingPoolCollateralManagerImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LendingPoolCollateralManagerFactory(await getFirstSigner()).deploy(),
    eContractid.LendingPoolCollateralManagerImpl,
    [],
    verify
  );

export const deployLendingPoolCollateralManager = async (verify?: boolean) => {
  const collateralManagerImpl = await new LendingPoolCollateralManagerFactory(
    await getFirstSigner()
  ).deploy();
  await insertContractAddressInDb(
    eContractid.LendingPoolCollateralManagerImpl,
    collateralManagerImpl.address
  );
  return withSaveAndVerify(
    collateralManagerImpl,
    eContractid.LendingPoolCollateralManager,
    [],
    verify
  );
};

export const deploySturdyProtocolDataProvider = async (
  addressesProvider: tEthereumAddress,
  verify?: boolean
) =>
  withSaveAndVerify(
    await new SturdyProtocolDataProviderFactory(await getFirstSigner()).deploy(addressesProvider),
    eContractid.SturdyProtocolDataProvider,
    [addressesProvider],
    verify
  );

export const deployMintableERC20 = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MintableERC20> =>
  withSaveAndVerify(
    await new MintableERC20Factory(await getFirstSigner()).deploy(...args),
    eContractid.MintableERC20,
    args,
    verify
  );

export const deployMintableDelegationERC20 = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MintableDelegationERC20> =>
  withSaveAndVerify(
    await new MintableDelegationERC20Factory(await getFirstSigner()).deploy(...args),
    eContractid.MintableDelegationERC20,
    args,
    verify
  );
export const deployDefaultReserveInterestRateStrategy = async (
  args: [tEthereumAddress, string, string, string, string, string, string],
  verify: boolean
) =>
  withSaveAndVerify(
    await new DefaultReserveInterestRateStrategyFactory(await getFirstSigner()).deploy(...args),
    eContractid.DefaultReserveInterestRateStrategy,
    args,
    verify
  );

export const deployStableDebtToken = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress, string, string, string],
  verify: boolean
) => {
  const instance = await withSaveAndVerify(
    await new StableDebtTokenFactory(await getFirstSigner()).deploy(),
    eContractid.StableDebtToken,
    [],
    verify
  );

  await instance.initialize(args[0], args[1], args[2], args[5], args[3], args[4], '0x10');

  return instance;
};

export const deployVariableDebtToken = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress, string, string, string],
  verify: boolean
) => {
  const instance = await withSaveAndVerify(
    await new VariableDebtTokenFactory(await getFirstSigner()).deploy(),
    eContractid.VariableDebtToken,
    [],
    verify
  );

  await instance.initialize(args[0], args[1], args[2], args[5], args[3], args[4], '0x10');

  return instance;
};

export const deployGenericStableDebtToken = async () =>
  withSaveAndVerify(
    await new StableDebtTokenFactory(await getFirstSigner()).deploy(),
    eContractid.StableDebtToken,
    [],
    false
  );

export const deployGenericVariableDebtToken = async () =>
  withSaveAndVerify(
    await new VariableDebtTokenFactory(await getFirstSigner()).deploy(),
    eContractid.VariableDebtToken,
    [],
    false
  );

export const deployGenericAToken = async (
  [
    poolAddress,
    underlyingAssetAddress,
    treasuryAddress,
    incentivesController,
    name,
    symbol,
    decimal,
  ]: [
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    string,
    string,
    string
  ],
  verify: boolean
) => {
  const instance = await withSaveAndVerify(
    await new ATokenFactory(await getFirstSigner()).deploy(),
    eContractid.AToken,
    [],
    verify
  );

  await instance.initialize(
    poolAddress,
    treasuryAddress,
    underlyingAssetAddress,
    incentivesController,
    decimal,
    name,
    symbol,
    '0x10'
  );

  return instance;
};

export const deployCollateralAToken = async (
  [
    poolAddress,
    underlyingAssetAddress,
    treasuryAddress,
    incentivesController,
    name,
    symbol,
    decimal,
  ]: [
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    string,
    string,
    string
  ],
  verify: boolean
) => {
  const instance = await withSaveAndVerify(
    await new ATokenForCollateralFactory(await getFirstSigner()).deploy(),
    eContractid.ATokenForCollateral,
    [],
    verify
  );

  await instance.initialize(
    poolAddress,
    treasuryAddress,
    underlyingAssetAddress,
    incentivesController,
    decimal,
    name,
    symbol,
    '0x10'
  );

  return instance;
};

export const deployGenericATokenImpl = async (verify: boolean) =>
  withSaveAndVerify(
    await new ATokenFactory(await getFirstSigner()).deploy(),
    eContractid.AToken,
    [],
    verify
  );

export const deployCollateralATokenImpl = async (verify: boolean) =>
  withSaveAndVerify(
    await new ATokenForCollateralFactory(await getFirstSigner()).deploy(),
    eContractid.ATokenForCollateral,
    [],
    verify
  );

export const deployAllMockTokens = async (verify?: boolean) => {
  const tokens: { [symbol: string]: MockContract | MintableERC20 } = {};

  const protoConfigData = getReservesConfigByPool(SturdyPools.proto);

  for (const tokenSymbol of Object.keys(TokenContractId)) {
    let decimals = '18';

    let configData = (<any>protoConfigData)[tokenSymbol];

    tokens[tokenSymbol] = await deployMintableERC20(
      [tokenSymbol, tokenSymbol, configData ? configData.reserveDecimals : decimals],
      verify
    );
    await registerContractInJsonDb(tokenSymbol.toUpperCase(), tokens[tokenSymbol]);
  }
  return tokens;
};

export const deployMockTokens = async (config: PoolConfiguration, verify?: boolean) => {
  const tokens: { [symbol: string]: MockContract | MintableERC20 } = {};
  const defaultDecimals = 18;

  const configData = config.ReservesConfig;

  for (const tokenSymbol of Object.keys(configData)) {
    tokens[tokenSymbol] = await deployMintableERC20(
      [
        tokenSymbol,
        tokenSymbol,
        configData[tokenSymbol as keyof iMultiPoolsAssets<IReserveParams>].reserveDecimals ||
          defaultDecimals.toString(),
      ],
      verify
    );
    await registerContractInJsonDb(tokenSymbol.toUpperCase(), tokens[tokenSymbol]);
  }
  return tokens;
};

export const deployStableAndVariableTokensHelper = async (
  args: [tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new StableAndVariableTokensHelperFactory(await getFirstSigner()).deploy(...args),
    eContractid.StableAndVariableTokensHelper,
    args,
    verify
  );

export const deployATokensAndRatesHelper = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new ATokensAndRatesHelperFactory(await getFirstSigner()).deploy(...args),
    eContractid.ATokensAndRatesHelper,
    args,
    verify
  );

export const deployMockStableDebtToken = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress, string, string, string],
  verify?: boolean
) => {
  const instance = await withSaveAndVerify(
    await new MockStableDebtTokenFactory(await getFirstSigner()).deploy(),
    eContractid.MockStableDebtToken,
    [],
    verify
  );

  await instance.initialize(args[0], args[1], args[2], '18', args[3], args[4], args[5]);

  return instance;
};

export const deployWETHMocked = async (verify?: boolean) =>
  withSaveAndVerify(
    await new WETH9MockedFactory(await getFirstSigner()).deploy(),
    eContractid.WETHMocked,
    [],
    verify
  );

export const deployMockVariableDebtToken = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress, string, string, string],
  verify?: boolean
) => {
  const instance = await withSaveAndVerify(
    await new MockVariableDebtTokenFactory(await getFirstSigner()).deploy(),
    eContractid.MockVariableDebtToken,
    [],
    verify
  );

  await instance.initialize(args[0], args[1], args[2], '18', args[3], args[4], args[5]);

  return instance;
};

export const deployMockAToken = async (
  args: [
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    tEthereumAddress,
    string,
    string,
    string
  ],
  verify?: boolean
) => {
  const instance = await withSaveAndVerify(
    await new MockATokenFactory(await getFirstSigner()).deploy(),
    eContractid.MockAToken,
    [],
    verify
  );

  await instance.initialize(args[0], args[2], args[1], args[3], '18', args[4], args[5], args[6]);

  return instance;
};

export const deployWalletBalancerProvider = async (verify?: boolean) =>
  withSaveAndVerify(
    await new WalletBalanceProviderFactory(await getFirstSigner()).deploy(),
    eContractid.WalletBalanceProvider,
    [],
    verify
  );

export const deployUiPoolDataProvider = async (
  [incentivesController, sturdyOracle]: [tEthereumAddress, tEthereumAddress],
  verify?: boolean
) => {
  const id = eContractid.UiPoolDataProvider;
  const args: string[] = [incentivesController, sturdyOracle];
  const instance = await deployContract<UiPoolDataProvider>(id, args);
  if (verify) {
    await verifyContract(id, instance, args);
  }
  return instance;
};

export const deployUiIncentiveDataProvider = async (verify?: boolean) =>
  withSaveAndVerify(
    await new UiIncentiveDataProviderFactory(await getFirstSigner()).deploy(),
    eContractid.UiIncentiveDataProvider,
    [],
    verify
  );

export const deployLidoVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LidoVaultFactory(await getFirstSigner()).deploy(),
    eContractid.LidoVaultImpl,
    [],
    verify
  );

export const deployLidoVault = async (verify?: boolean) => {
  const lidoVaultImpl = await withSaveAndVerify(
    await new LidoVaultFactory(await getFirstSigner()).deploy(),
    eContractid.LidoVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('LIDO_VAULT'),
      lidoVaultImpl.address
    )
  );

  const config: ISturdyConfiguration = loadPoolConfig(ConfigNames.Sturdy) as ISturdyConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('LIDO'),
      getParamPerNetwork(config.Lido, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('CurveswapLidoPool'),
      getParamPerNetwork(config.CurveswapLidoPool, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('uniswapRouter'),
      getParamPerNetwork(config.UniswapRouter, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('WETH'),
      getParamPerNetwork(config.WETH, network)
    )
  );

  const lidoVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('LIDO_VAULT')
  );
  await insertContractAddressInDb(eContractid.LidoVault, lidoVaultProxyAddress);

  return await getLidoVault();
};

export const deployYearnVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new YearnVaultFactory(await getFirstSigner()).deploy(),
    eContractid.YearnVaultImpl,
    [],
    verify
  );

export const deployYearnVault = async (verify?: boolean) => {
  const yearnVaultImpl = await withSaveAndVerify(
    await new YearnVaultFactory(await getFirstSigner()).deploy(),
    eContractid.YearnVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('YEARN_VAULT'),
      yearnVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('YVWFTM'),
      getParamPerNetwork(config.YearnVaultFTM, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('uniswapRouter'),
      getParamPerNetwork(config.UniswapRouter, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('WFTM'),
      getParamPerNetwork(config.WFTM, network)
    )
  );

  const yearnVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('YEARN_VAULT')
  );
  await insertContractAddressInDb(eContractid.YearnVault, yearnVaultProxyAddress);

  return await getYearnVault();
};

export const deployYearnWETHVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new YearnWETHVaultFactory(await getFirstSigner()).deploy(),
    eContractid.YearnWETHVaultImpl,
    [],
    verify
  );

export const deployYearnWETHVault = async (verify?: boolean) => {
  const yearnWETHVaultImpl = await withSaveAndVerify(
    await new YearnWETHVaultFactory(await getFirstSigner()).deploy(),
    eContractid.YearnWETHVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('YEARN_WETH_VAULT'),
      yearnWETHVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('YVWETH'),
      getParamPerNetwork(config.YearnWETHVaultFTM, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('WETH'),
      getParamPerNetwork(config.WETH, network)
    )
  );

  const yearnWETHVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('YEARN_WETH_VAULT')
  );
  await insertContractAddressInDb(eContractid.YearnWETHVault, yearnWETHVaultProxyAddress);

  return await getYearnWETHVault();
};

export const deployYearnWBTCVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new YearnWBTCVaultFactory(await getFirstSigner()).deploy(),
    eContractid.YearnWBTCVaultImpl,
    [],
    verify
  );

export const deployYearnWBTCVault = async (verify?: boolean) => {
  const yearnWBTCVaultImpl = await withSaveAndVerify(
    await new YearnWBTCVaultFactory(await getFirstSigner()).deploy(),
    eContractid.YearnWBTCVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('YEARN_WBTC_VAULT'),
      yearnWBTCVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('YVWBTC'),
      getParamPerNetwork(config.YearnWBTCVaultFTM, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('WBTC'),
      getParamPerNetwork(config.WBTC, network)
    )
  );

  const yearnWBTCVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('YEARN_WBTC_VAULT')
  );
  await insertContractAddressInDb(eContractid.YearnWBTCVault, yearnWBTCVaultProxyAddress);

  return await getYearnWBTCVault();
};

export const deployYearnBOOVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new YearnBOOVaultFactory(await getFirstSigner()).deploy(),
    eContractid.YearnBOOVaultImpl,
    [],
    verify
  );

export const deployYearnBOOVault = async (verify?: boolean) => {
  const yearnBOOVaultImpl = await withSaveAndVerify(
    await new YearnBOOVaultFactory(await getFirstSigner()).deploy(),
    eContractid.YearnBOOVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('YEARN_BOO_VAULT'),
      yearnBOOVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('YVBOO'),
      getParamPerNetwork(config.YearnBOOVaultFTM, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('BOO'),
      getParamPerNetwork(config.BOO, network)
    )
  );

  const yearnBOOVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('YEARN_BOO_VAULT')
  );
  await insertContractAddressInDb(eContractid.YearnBOOVault, yearnBOOVaultProxyAddress);

  return await getYearnBOOVault();
};

export const deployTombFTMBeefyVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new TombFtmBeefyVaultFactory(await getFirstSigner()).deploy(),
    eContractid.TombFtmBeefyVaultImpl,
    [],
    verify
  );

export const deployTombFTMBeefyVault = async (verify?: boolean) => {
  const tombFtmBeefyVaultImpl = await withSaveAndVerify(
    await new TombFtmBeefyVaultFactory(await getFirstSigner()).deploy(),
    eContractid.TombFtmBeefyVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('BEEFY_TOMB_FTM_VAULT'),
      tombFtmBeefyVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('mooTombTOMB-FTM'),
      getParamPerNetwork(config.BeefyVaultTOMB_FTM, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('TOMB_FTM_LP'),
      getParamPerNetwork(config.TOMB_FTM_LP, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('TOMB'),
      getParamPerNetwork(config.TOMB, network)
    )
  );

  const tombFtmBeefyVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('BEEFY_TOMB_FTM_VAULT')
  );
  await insertContractAddressInDb(eContractid.TombFtmBeefyVault, tombFtmBeefyVaultProxyAddress);

  return await getTombFtmBeefyVault();
};

export const deployTombMiMaticBeefyVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new TombMimaticBeefyVaultFactory(await getFirstSigner()).deploy(),
    eContractid.TombMiMaticBeefyVaultImpl,
    [],
    verify
  );

export const deployTombMiMaticBeefyVault = async (verify?: boolean) => {
  const tombMiMaticBeefyVaultImpl = await withSaveAndVerify(
    await new TombMimaticBeefyVaultFactory(await getFirstSigner()).deploy(),
    eContractid.TombMiMaticBeefyVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('BEEFY_TOMB_MIMATIC_VAULT'),
      tombMiMaticBeefyVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('mooTombTOMB-MIMATIC'),
      getParamPerNetwork(config.BeefyVaultTOMB_MIMATIC, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('TOMB_MIMATIC_LP'),
      getParamPerNetwork(config.TOMB_MIMATIC_LP, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('MIMATIC'),
      getParamPerNetwork(config.MIMATIC, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('USDC'),
      getParamPerNetwork(config.ReserveAssets, network).USDC
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('tombSwapRouter'),
      getParamPerNetwork(config.TombSwapRouter, network)
    )
  );

  const tombMiMaticBeefyVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('BEEFY_TOMB_MIMATIC_VAULT')
  );
  await insertContractAddressInDb(
    eContractid.TombMiMaticBeefyVault,
    tombMiMaticBeefyVaultProxyAddress
  );

  return await getTombMiMaticBeefyVault();
};

// export const deployBeefyVault = async (verify?: boolean) => {
//   const beefyVault = await withSaveAndVerify(
//     await new BeefyVaultFactory(await getFirstSigner()).deploy(),
//     eContractid.BeefyVaultImpl,
//     [],
//     verify
//   );

//   const addressesProvider = await getLendingPoolAddressesProvider();
//   await waitForTx(
//     await addressesProvider.setAddressAsProxy(
//       DRE.ethers.utils.formatBytes32String('BEEFY_VAULT'),
//       beefyVault.address
//     )
//   );

//   const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
//   const network = <eNetwork>DRE.network.name;
//   await waitForTx(
//     await addressesProvider.setAddress(
//       DRE.ethers.utils.formatBytes32String('MOOWETH'),
//       getParamPerNetwork(config.BeefyVaultFTM, network)
//     )
//   );

//   await waitForTx(
//     await addressesProvider.setAddress(
//       DRE.ethers.utils.formatBytes32String('WETH'),
//       getParamPerNetwork(config.WETH, network)
//     )
//   );

//   const beefyVaultProxyAddress = await addressesProvider.getAddress(
//     DRE.ethers.utils.formatBytes32String('BEEFY_VAULT')
//   );
//   await insertContractAddressInDb(eContractid.BeefyVault, beefyVaultProxyAddress);

//   return await getBeefyVault();
// };

export const deploySturdyIncentivesControllerImpl = async (
  args: [tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new StakedTokenIncentivesControllerFactory(await getFirstSigner()).deploy(...args),
    eContractid.StakedTokenIncentivesControllerImpl,
    args,
    verify
  );

export const deploySturdyIncentivesController = async (
  args: [tEthereumAddress],
  verify?: boolean
) => {
  const incentiveControllerImpl = await withSaveAndVerify(
    await new StakedTokenIncentivesControllerFactory(await getFirstSigner()).deploy(...args),
    eContractid.StakedTokenIncentivesControllerImpl,
    args,
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setIncentiveControllerImpl(incentiveControllerImpl.address)
  );
  const incentiveControllerProxyAddress = await addressesProvider.getIncentiveController();
  await insertContractAddressInDb(
    eContractid.StakedTokenIncentivesController,
    incentiveControllerProxyAddress
  );

  return await getSturdyIncentivesController();
};

export const deploySturdyTokenImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new SturdyTokenFactory(await getFirstSigner()).deploy(),
    eContractid.SturdyTokenImpl,
    [],
    verify
  );

export const deploySturdyToken = async (verify?: boolean) => {
  const incentiveTokenImpl = await withSaveAndVerify(
    await new SturdyTokenFactory(await getFirstSigner()).deploy(),
    eContractid.SturdyTokenImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await addressesProvider.setIncentiveTokenImpl(incentiveTokenImpl.address));
  const incentiveTokenProxyAddress = await addressesProvider.getIncentiveToken();
  await insertContractAddressInDb(eContractid.SturdyToken, incentiveTokenProxyAddress);

  return await getSturdyToken();
};

export const deployCollateralAdapter = async (verify?: boolean) => {
  const collateralAdapterImpl = await withSaveAndVerify(
    await new CollateralAdapterFactory(await getFirstSigner()).deploy(),
    eContractid.CollateralAdapterImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('COLLATERAL_ADAPTER'),
      collateralAdapterImpl.address
    )
  );
  const collateralAdapterProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('COLLATERAL_ADAPTER')
  );
  await insertContractAddressInDb(eContractid.CollateralAdapter, collateralAdapterProxyAddress);

  return await getCollateralAdapter();
};

export const deployMockDai = async (chainId: any, verify?: boolean) =>
  withSaveAndVerify(
    await new DaiFactory(await getFirstSigner()).deploy(chainId),
    eContractid.DAIToken,
    [chainId],
    verify
  );

export const deployMockUSDC = async (args: [string, string, any, string], verify?: boolean) =>
  withSaveAndVerify(
    await new UsdcFactory(await getFirstSigner()).deploy(...args),
    eContractid.USDCToken,
    args,
    verify
  );

export const deployMockUSDT = async (args: [string, string, any, string], verify?: boolean) =>
  withSaveAndVerify(
    await new UsdtFactory(await getFirstSigner()).deploy(...args),
    eContractid.USDTToken,
    args,
    verify
  );

export const deployMockyvWFTM = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockyvWFTMFactory(await getFirstSigner()).deploy(...args),
    eContractid.MockyvWFTM,
    args,
    verify
  );

export const deployMockyvWETH = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockyvWETHFactory(await getFirstSigner()).deploy(...args),
    eContractid.MockyvWETH,
    args,
    verify
  );

export const deployMockyvWBTC = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockyvWBTCFactory(await getFirstSigner()).deploy(...args),
    eContractid.MockyvWBTC,
    args,
    verify
  );

export const deployMockyvBOO = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockyvBOOFactory(await getFirstSigner()).deploy(...args),
    eContractid.MockyvBOO,
    args,
    verify
  );

export const deployMockWETHForFTM = async (
  args: [string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockWETHForFTMFactory(await getFirstSigner()).deploy(...args),
    eContractid.MockWETHForFTM,
    args,
    verify
  );

export const deployMockWBTCForFTM = async (
  args: [string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockWBTCForFTMFactory(await getFirstSigner()).deploy(...args),
    eContractid.MockWBTCForFTM,
    args,
    verify
  );

export const deployMockBOOForFTM = async (
  args: [string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockBOOForFTMFactory(await getFirstSigner()).deploy(...args),
    eContractid.MockBOOForFTM,
    args,
    verify
  );

export const deployMockMooTOMBFTM = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockMooTOMBFTMFactory(await getFirstSigner()).deploy(...args),
    eContractid.MockMooTOMBFTM,
    args,
    verify
  );

export const deployMockMooTOMBMIMATIC = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockMooTOMBMIMATICFactory(await getFirstSigner()).deploy(...args),
    eContractid.MockMooTOMBMIMATIC,
    args,
    verify
  );
