import { Contract } from 'ethers';
import { DRE, waitForTx } from './misc-utils';
import {
  tEthereumAddress,
  eContractid,
  eEthereumNetwork,
  eNetwork,
  IEthConfiguration,
} from './types';
import { ConfigNames, loadPoolConfig } from './configuration';
import {
  getCollateralAdapter,
  getFirstSigner,
  getLendingPoolAddressesProvider,
  getSturdyIncentivesController,
  getSturdyToken,
  getYieldManager,
  getUniswapAdapterAddress,
  getCurveswapAdapterAddress,
  getStableYieldDistributionImpl,
  getFXSStableYieldDistribution,
  getVariableYieldDistributionImpl,
  getVariableYieldDistribution,
  getLeverageSwapManager,
  getValidationLogic,
  getGenericLogic,
  getReserveLogicLibrary,
  getBalancerswapAdapterAddress,
  getConvexETHSTETHVault,
  getAuraWSTETHWETHVault,
} from './contracts-getters';
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
  ReserveLogicFactory,
  StableDebtTokenFactory,
  VariableDebtTokenFactory,
  LendingPoolFactory,
  StakedTokenIncentivesControllerFactory,
  SturdyTokenFactory,
  UiPoolDataProvider,
  WalletBalanceProviderFactory,
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
  ETHSTETHOracleFactory,
  ETHSTETHLevSwapFactory,
  BALWSTETHWETHOracleFactory,
  AURAWSTETHWETHLevSwapFactory,
  AURAOracleFactory,
  ConvexCurveLPVault2Factory,
  WETHGatewayFactory,
} from '../types';
import {
  withSaveAndVerify,
  linkBytecode,
  insertContractAddressInDb,
  getParamPerNetwork,
  deployContract,
  verifyContract,
  getContract,
} from './contracts-helpers';
import { StableAndVariableTokensHelperFactory } from '../types/StableAndVariableTokensHelperFactory';
import { readArtifact as buidlerReadArtifact } from '@nomiclabs/buidler/plugins';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { LendingPoolLibraryAddresses } from '../types/LendingPoolFactory';
import { YieldManagerLibraryAddresses } from '../types/YieldManagerFactory';

const readArtifact = async (id: string) => {
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

export const deployReserveLogicLibrary = async (verify?: boolean) => {
  const contractAddress = await getReserveLogicLibrary();
  if (contractAddress) {
    return await getContract(eContractid.ReserveLogic, contractAddress);
  }

  return withSaveAndVerify(
    await new ReserveLogicFactory(await getFirstSigner()).deploy(),
    eContractid.ReserveLogic,
    [],
    verify
  );
};

export const deployGenericLogic = async (reserveLogic: Contract, verify?: boolean) => {
  const contractAddress = await getGenericLogic();
  if (contractAddress) {
    return await getContract(eContractid.GenericLogic, contractAddress);
  }

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
  const contractAddress = await getValidationLogic();
  if (contractAddress) {
    return await getContract(eContractid.ValidationLogic, contractAddress);
  }

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

export const deployLendingRateOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LendingRateOracleFactory(await getFirstSigner()).deploy(),
    eContractid.LendingRateOracle,
    [],
    verify
  );

export const deploySturdyOracle = async (
  args: [
    tEthereumAddress[],
    tEthereumAddress[],
    boolean[],
    tEthereumAddress,
    tEthereumAddress,
    string
  ],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new SturdyOracleFactory(await getFirstSigner()).deploy(...args),
    eContractid.SturdyOracle,
    args,
    verify
  );

export const deployETHSTETHOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ETHSTETHOracleFactory(await getFirstSigner()).deploy(),
    eContractid.ETHSTETHOracle,
    [],
    verify
  );

export const deployBALWSTETHWETHOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BALWSTETHWETHOracleFactory(await getFirstSigner()).deploy(),
    eContractid.BALWSTETHWETHOracle,
    [],
    verify
  );

export const deployAURAOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new AURAOracleFactory(await getFirstSigner()).deploy(),
    eContractid.AURAOracle,
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

export const deployDefaultReserveInterestRateStrategy = async (
  args: [tEthereumAddress, string, string, string, string, string, string, string, string],
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

export const deployStableAndVariableTokensHelper = async (args: [], verify?: boolean) =>
  withSaveAndVerify(
    await new StableAndVariableTokensHelperFactory(await getFirstSigner()).deploy(...args),
    eContractid.StableAndVariableTokensHelper,
    args,
    verify
  );

export const deployATokensAndRatesHelper = async (args: [tEthereumAddress], verify?: boolean) =>
  withSaveAndVerify(
    await new ATokensAndRatesHelperFactory(await getFirstSigner()).deploy(...args),
    eContractid.ATokensAndRatesHelper,
    args,
    verify
  );

export const deployWETHGateway = async (args: [], verify?: boolean) =>
  withSaveAndVerify(
    await new WETHGatewayFactory(await getFirstSigner()).deploy(...args),
    eContractid.WETHGateway,
    args,
    verify
  );

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

export const deployConvexETHSTETHVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault2Factory(await getFirstSigner()).deploy(),
    eContractid.ConvexETHSTETHVaultImpl,
    [],
    verify
  );

  const config: IEthConfiguration = loadPoolConfig(ConfigNames.Eth) as IEthConfiguration;
  const network = <eNetwork>DRE.network.name;

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_ETH_STETH_VAULT'),
      vaultImpl.address
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('uniswapRouter'),
      getParamPerNetwork(config.UniswapRouter, network)
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_ETH_STETH_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexETHSTETHVault, proxyAddress);

  return await getConvexETHSTETHVault();
};

export const deployAuraWSTETHWETHVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new AuraBalancerLPVaultFactory(await getFirstSigner()).deploy(),
    eContractid.AuraWSTETHWETHVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('AURA_WSTETH_WETH_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('AURA_WSTETH_WETH_VAULT')
  );
  await insertContractAddressInDb(eContractid.AuraWSTETHWETHVault, proxyAddress);

  return await getAuraWSTETHWETHVault();
};

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
  await waitForTx(await incentiveControllerImpl.initialize(addressesProvider.address));
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
  await waitForTx(await incentiveTokenImpl.initialize(addressesProvider.address));
  await waitForTx(await addressesProvider.setIncentiveTokenImpl(incentiveTokenImpl.address));
  const incentiveTokenProxyAddress = await addressesProvider.getIncentiveToken();
  await insertContractAddressInDb(eContractid.SturdyToken, incentiveTokenProxyAddress);

  return await getSturdyToken();
};

export const deployStableYieldDistributionImpl = async (args: [string], verify?: boolean) => {
  const impl = await withSaveAndVerify(
    await new StableYieldDistributionFactory(await getFirstSigner()).deploy(...args),
    eContractid.StableYieldDistributionImpl,
    args,
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await impl.initialize(addressesProvider.address));
  return impl;
};

export const deployFXSStableYieldDistribution = async () => {
  const stableYieldDistributionImpl = await getStableYieldDistributionImpl();
  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('FXS_YIELD_DISTRIBUTOR'),
      stableYieldDistributionImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('FXS_YIELD_DISTRIBUTOR')
  );
  await insertContractAddressInDb(eContractid.FXSStableYieldDistribution, proxyAddress);

  return await getFXSStableYieldDistribution();
};

export const deployVariableYieldDistributionImpl = async (args: [string], verify?: boolean) => {
  const impl = await withSaveAndVerify(
    await new VariableYieldDistributionFactory(await getFirstSigner()).deploy(...args),
    eContractid.VariableYieldDistributionImpl,
    args,
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await impl.initialize(addressesProvider.address));
  return impl;
};

export const deployVariableYieldDistribution = async () => {
  const variableYieldDistributionImpl = await getVariableYieldDistributionImpl();
  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('VR_YIELD_DISTRIBUTOR'),
      variableYieldDistributionImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('VR_YIELD_DISTRIBUTOR')
  );
  await insertContractAddressInDb(eContractid.VariableYieldDistribution, proxyAddress);

  return await getVariableYieldDistribution();
};

export const deployCollateralAdapter = async (verify?: boolean) => {
  const collateralAdapterImpl = await withSaveAndVerify(
    await new CollateralAdapterFactory(await getFirstSigner()).deploy(),
    eContractid.CollateralAdapterImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await collateralAdapterImpl.initialize(addressesProvider.address));
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

export const deployETHLiquidator = async (args: [string], verify?: boolean) => {
  const libraries = await deploySwapAdapterLibraries(verify);
  const liquidator = await withSaveAndVerify(
    await new ETHLiquidatorFactory(libraries, await getFirstSigner()).deploy(...args),
    eContractid.ETHLiquidator,
    args,
    verify
  );

  // const addressesProvider = await getLendingPoolAddressesProvider();
  // const config: ISturdyConfiguration = loadPoolConfig(ConfigNames.Sturdy) as ISturdyConfiguration;
  // const network = <eNetwork>DRE.network.name;
  // await waitForTx(
  //   await addressesProvider.setAddress(
  //     DRE.ethers.utils.formatBytes32String('AAVE_LENDING_POOL'),
  //     getParamPerNetwork(config.AavePool, network)
  //   )
  // );

  return liquidator;
};

export const deployVaultHelper = async (args: [string], verify?: boolean) =>
  withSaveAndVerify(
    await new DeployVaultHelperFactory(await getFirstSigner()).deploy(...args),
    eContractid.DeployVaultHelper,
    args,
    verify
  );

export const deployUniswapAdapterLibrary = async (verify?: boolean) => {
  const contractAddress = await getUniswapAdapterAddress();
  if (contractAddress) {
    return await getContract(eContractid.UniswapAdapter, contractAddress);
  }

  const uniswapAdapterArtifact = await readArtifact(eContractid.UniswapAdapter);

  const linkedUniswapAdapterByteCode = linkBytecode(uniswapAdapterArtifact, {});

  const uniswapAdapterFactory = await DRE.ethers.getContractFactory(
    uniswapAdapterArtifact.abi,
    linkedUniswapAdapterByteCode
  );

  const uniswapAdapter = await (
    await uniswapAdapterFactory.connect(await getFirstSigner()).deploy()
  ).deployed();

  return withSaveAndVerify(uniswapAdapter, eContractid.UniswapAdapter, [], verify);
};

export const deployCurveswapAdapterLibrary = async (verify?: boolean) => {
  const contractAddress = await getCurveswapAdapterAddress();
  if (contractAddress) {
    return await getContract(eContractid.CurveswapAdapter, contractAddress);
  }

  const config: IEthConfiguration = loadPoolConfig(ConfigNames.Eth) as IEthConfiguration;
  const network = <eNetwork>DRE.network.name;
  const addressesProvider = await getLendingPoolAddressesProvider();

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('CURVE_ADDRESS_PROVIDER'),
      getParamPerNetwork(config.CurveswapAddressProvider, network)
    )
  );

  const curveswapAdapterArtifact = await readArtifact(eContractid.CurveswapAdapter);

  const linkedCurveswapAdapterByteCode = linkBytecode(curveswapAdapterArtifact, {});

  const curveswapAdapterFactory = await DRE.ethers.getContractFactory(
    curveswapAdapterArtifact.abi,
    linkedCurveswapAdapterByteCode
  );

  const curveswapAdapter = await (
    await curveswapAdapterFactory.connect(await getFirstSigner()).deploy()
  ).deployed();

  return withSaveAndVerify(curveswapAdapter, eContractid.CurveswapAdapter, [], verify);
};

export const deployBalancerswapAdapterLibrary = async (verify?: boolean) => {
  const contractAddress = await getBalancerswapAdapterAddress();
  if (contractAddress) {
    return await getContract(eContractid.BalancerswapAdapter, contractAddress);
  }

  const balancerswapAdapterArtifact = await readArtifact(eContractid.BalancerswapAdapter);

  const linkedBalancerswapAdapterByteCode = linkBytecode(balancerswapAdapterArtifact, {});

  const balancerswapAdapterFactory = await DRE.ethers.getContractFactory(
    balancerswapAdapterArtifact.abi,
    linkedBalancerswapAdapterByteCode
  );

  const balancerswapAdapter = await (
    await balancerswapAdapterFactory.connect(await getFirstSigner()).deploy()
  ).deployed();

  return withSaveAndVerify(balancerswapAdapter, eContractid.BalancerswapAdapter, [], verify);
};

export const deploySwapAdapterLibraries = async (
  verify?: boolean
): Promise<YieldManagerLibraryAddresses> => {
  const uniswapAdapter = await deployUniswapAdapterLibrary(verify);
  const curveswapAdapter = await deployCurveswapAdapterLibrary(verify);
  const balancerswapAdapter = await deployBalancerswapAdapterLibrary(verify);

  return {
    ['__$bcdc6d14c161e470cad87c28c9e4ece31f$__']: balancerswapAdapter.address,
    ['__$efebe91d5f5edc44768630199364d824de$__']: uniswapAdapter.address,
    ['__$dd23f1857e690ebd380179be2f7f3c5f60$__']: curveswapAdapter.address,
  };
};

export const deployYieldManagerImpl = async (verify?: boolean) => {
  const libraries = await deploySwapAdapterLibraries(verify);
  withSaveAndVerify(
    await new YieldManagerFactory(libraries, await getFirstSigner()).deploy(),
    eContractid.YieldManagerImpl,
    [],
    verify
  );
};

export const deployYieldManager = async (verify?: boolean) => {
  const libraries = await deploySwapAdapterLibraries(verify);
  const yieldManagerImpl = await withSaveAndVerify(
    await new YieldManagerFactory(libraries, await getFirstSigner()).deploy(),
    eContractid.YieldManagerImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await yieldManagerImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('YIELD_MANAGER'),
      yieldManagerImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('YIELD_MANAGER')
  );
  await insertContractAddressInDb(eContractid.YieldManager, proxyAddress);

  return await getYieldManager();
};

export const deployLeverageSwapManagerImpl = async (verify?: boolean) => {
  withSaveAndVerify(
    await new LeverageSwapManagerFactory(await getFirstSigner()).deploy(),
    eContractid.LeverageSwapManagerImpl,
    [],
    verify
  );
};

export const deployLeverageSwapManager = async (verify?: boolean) => {
  const leverageManagerImpl = await withSaveAndVerify(
    await new LeverageSwapManagerFactory(await getFirstSigner()).deploy(),
    eContractid.LeverageSwapManagerImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await leverageManagerImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('LEVERAGE_SWAP_MANAGER'),
      leverageManagerImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('LEVERAGE_SWAP_MANAGER')
  );
  await insertContractAddressInDb(eContractid.LeverageSwapManager, proxyAddress);

  return await getLeverageSwapManager();
};

export const deployETHSTETHLevSwap = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new ETHSTETHLevSwapFactory(await getFirstSigner()).deploy(...args),
    eContractid.ETHSTETHLevSwap,
    args,
    verify
  );

export const deployAURAWSTETHWETHLevSwap = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new AURAWSTETHWETHLevSwapFactory(await getFirstSigner()).deploy(...args),
    eContractid.AURAWSTETHWETHLevSwap,
    args,
    verify
  );

export const deploySturdyAPRDataProvider = async (args: [tEthereumAddress], verify?: boolean) =>
  withSaveAndVerify(
    await new SturdyAPRDataProviderFactory(await getFirstSigner()).deploy(...args),
    eContractid.SturdyAPRDataProvider,
    args,
    verify
  );
