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
  SturdyProtocolDataProvider__factory,
  AToken__factory,
  ATokensAndRatesHelper__factory,
  SturdyOracle__factory,
  DefaultReserveInterestRateStrategy__factory,
  LendingPoolAddressesProvider__factory,
  LendingPoolAddressesProviderRegistry__factory,
  LendingPoolCollateralManager__factory,
  LendingPoolConfigurator__factory,
  LendingRateOracle__factory,
  ReserveLogic__factory,
  StableDebtToken__factory,
  VariableDebtToken__factory,
  LendingPool__factory,
  StakedTokenIncentivesController__factory,
  SturdyToken__factory,
  UiPoolDataProvider,
  WalletBalanceProvider__factory,
  UiIncentiveDataProvider__factory,
  ATokenForCollateral__factory,
  CollateralAdapter__factory,
  ETHLiquidator__factory,
  DeployVaultHelper__factory,
  YieldManager__factory,
  StableYieldDistribution__factory,
  VariableYieldDistribution__factory,
  LeverageSwapManager__factory,
  SturdyAPRDataProvider__factory,
  AuraBalancerLPVault__factory,
  ETHSTETHOracle__factory,
  ETHSTETHLevSwap__factory,
  BALWSTETHWETHOracle__factory,
  AURAWSTETHWETHLevSwap__factory,
  AURAOracle__factory,
  ConvexCurveLPVault2__factory,
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
import { StableAndVariableTokensHelper__factory } from '../types';
import { readArtifact as buidlerReadArtifact } from '@nomiclabs/buidler/plugins';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { LendingPoolLibraryAddresses } from '../types/factories/protocol/lendingpool/LendingPool__factory';
import { YieldManagerLibraryAddresses } from '../types/factories/incentives/YieldManager__factory';

const readArtifact = async (id: string) => {
  return (DRE as HardhatRuntimeEnvironment).artifacts.readArtifact(id);
};

export const deployLendingPoolAddressesProvider = async (marketId: string, verify?: boolean) =>
  withSaveAndVerify(
    await new LendingPoolAddressesProvider__factory(await getFirstSigner()).deploy(marketId),
    eContractid.LendingPoolAddressesProvider,
    [marketId],
    verify
  );

export const deployLendingPoolAddressesProviderRegistry = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LendingPoolAddressesProviderRegistry__factory(await getFirstSigner()).deploy(),
    eContractid.LendingPoolAddressesProviderRegistry,
    [],
    verify
  );

export const deployLendingPoolConfiguratorImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LendingPoolConfigurator__factory(await getFirstSigner()).deploy(),
    eContractid.LendingPoolConfiguratorImpl,
    [],
    verify
  );

export const deployLendingPoolConfigurator = async (verify?: boolean) => {
  const lendingPoolConfiguratorImpl = await new LendingPoolConfigurator__factory(
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
    await new ReserveLogic__factory(await getFirstSigner()).deploy(),
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

  const genericLogic__factory = await DRE.ethers.getContractFactory(
    genericLogicArtifact.abi,
    linkedGenericLogicByteCode
  );

  const genericLogic = await (
    await genericLogic__factory.connect(await getFirstSigner()).deploy()
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

  const validationLogic__factory = await DRE.ethers.getContractFactory(
    validationLogicArtifact.abi,
    linkedValidationLogicByteCode
  );

  const validationLogic = await (
    await validationLogic__factory.connect(await getFirstSigner()).deploy()
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
    ['contracts/protocol/libraries/logic/ValidationLogic.sol:ValidationLogic']:
      validationLogic.address,
    ['contracts/protocol/libraries/logic/ReserveLogic.sol:ReserveLogic']: reserveLogic.address,
  };
};

export const deployLendingPoolImpl = async (verify?: boolean) => {
  const libraries = await deploySturdyLibraries(verify);
  const lendingPoolImpl = await new LendingPool__factory(
    libraries,
    await getFirstSigner()
  ).deploy();
  await insertContractAddressInDb(eContractid.LendingPoolImpl, lendingPoolImpl.address);
  return lendingPoolImpl;
};

export const deployLendingPool = async (verify?: boolean) => {
  const libraries = await deploySturdyLibraries(verify);
  const lendingPoolImpl = await new LendingPool__factory(
    libraries,
    await getFirstSigner()
  ).deploy();
  await insertContractAddressInDb(eContractid.LendingPoolImpl, lendingPoolImpl.address);
  return withSaveAndVerify(lendingPoolImpl, eContractid.LendingPool, [], verify);
};

export const deployLendingRateOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LendingRateOracle__factory(await getFirstSigner()).deploy(),
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
    await new SturdyOracle__factory(await getFirstSigner()).deploy(...args),
    eContractid.SturdyOracle,
    args,
    verify
  );

export const deployETHSTETHOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ETHSTETHOracle__factory(await getFirstSigner()).deploy(),
    eContractid.ETHSTETHOracle,
    [],
    verify
  );

export const deployBALWSTETHWETHOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BALWSTETHWETHOracle__factory(await getFirstSigner()).deploy(),
    eContractid.BALWSTETHWETHOracle,
    [],
    verify
  );

export const deployAURAOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new AURAOracle__factory(await getFirstSigner()).deploy(),
    eContractid.AURAOracle,
    [],
    verify
  );

export const deployLendingPoolCollateralManagerImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LendingPoolCollateralManager__factory(await getFirstSigner()).deploy(),
    eContractid.LendingPoolCollateralManagerImpl,
    [],
    verify
  );

export const deployLendingPoolCollateralManager = async (verify?: boolean) => {
  const collateralManagerImpl = await new LendingPoolCollateralManager__factory(
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
    await new SturdyProtocolDataProvider__factory(await getFirstSigner()).deploy(addressesProvider),
    eContractid.SturdyProtocolDataProvider,
    [addressesProvider],
    verify
  );

export const deployDefaultReserveInterestRateStrategy = async (
  args: [tEthereumAddress, string, string, string, string, string, string, string, string],
  verify: boolean
) =>
  withSaveAndVerify(
    await new DefaultReserveInterestRateStrategy__factory(await getFirstSigner()).deploy(...args),
    eContractid.DefaultReserveInterestRateStrategy,
    args,
    verify
  );

export const deployStableDebtToken = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress, string, string, string],
  verify: boolean
) => {
  const instance = await withSaveAndVerify(
    await new StableDebtToken__factory(await getFirstSigner()).deploy(),
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
    await new VariableDebtToken__factory(await getFirstSigner()).deploy(),
    eContractid.VariableDebtToken,
    [],
    verify
  );

  await instance.initialize(args[0], args[1], args[2], args[5], args[3], args[4], '0x10');

  return instance;
};

export const deployGenericStableDebtToken = async () =>
  withSaveAndVerify(
    await new StableDebtToken__factory(await getFirstSigner()).deploy(),
    eContractid.StableDebtToken,
    [],
    false
  );

export const deployGenericVariableDebtToken = async () =>
  withSaveAndVerify(
    await new VariableDebtToken__factory(await getFirstSigner()).deploy(),
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
    await new AToken__factory(await getFirstSigner()).deploy(),
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
    await new ATokenForCollateral__factory(await getFirstSigner()).deploy(),
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
    await new AToken__factory(await getFirstSigner()).deploy(),
    eContractid.AToken,
    [],
    verify
  );

export const deployCollateralATokenImpl = async (verify: boolean) =>
  withSaveAndVerify(
    await new ATokenForCollateral__factory(await getFirstSigner()).deploy(),
    eContractid.ATokenForCollateral,
    [],
    verify
  );

export const deployStableAndVariableTokensHelper = async (args: [], verify?: boolean) =>
  withSaveAndVerify(
    await new StableAndVariableTokensHelper__factory(await getFirstSigner()).deploy(...args),
    eContractid.StableAndVariableTokensHelper,
    args,
    verify
  );

export const deployATokensAndRatesHelper = async (args: [tEthereumAddress], verify?: boolean) =>
  withSaveAndVerify(
    await new ATokensAndRatesHelper__factory(await getFirstSigner()).deploy(...args),
    eContractid.ATokensAndRatesHelper,
    args,
    verify
  );

export const deployWalletBalancerProvider = async (verify?: boolean) =>
  withSaveAndVerify(
    await new WalletBalanceProvider__factory(await getFirstSigner()).deploy(),
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
    await new UiIncentiveDataProvider__factory(await getFirstSigner()).deploy(),
    eContractid.UiIncentiveDataProvider,
    [],
    verify
  );

export const deployConvexETHSTETHVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault2__factory(await getFirstSigner()).deploy(),
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
    await new AuraBalancerLPVault__factory(await getFirstSigner()).deploy(),
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
    await new StakedTokenIncentivesController__factory(await getFirstSigner()).deploy(...args),
    eContractid.StakedTokenIncentivesControllerImpl,
    args,
    verify
  );

export const deploySturdyIncentivesController = async (
  args: [tEthereumAddress],
  verify?: boolean
) => {
  const incentiveControllerImpl = await withSaveAndVerify(
    await new StakedTokenIncentivesController__factory(await getFirstSigner()).deploy(...args),
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
    await new SturdyToken__factory(await getFirstSigner()).deploy(),
    eContractid.SturdyTokenImpl,
    [],
    verify
  );

export const deploySturdyToken = async (verify?: boolean) => {
  const incentiveTokenImpl = await withSaveAndVerify(
    await new SturdyToken__factory(await getFirstSigner()).deploy(),
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
    await new StableYieldDistribution__factory(await getFirstSigner()).deploy(...args),
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
    await new VariableYieldDistribution__factory(await getFirstSigner()).deploy(...args),
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
    await new CollateralAdapter__factory(await getFirstSigner()).deploy(),
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
    await new ETHLiquidator__factory(libraries, await getFirstSigner()).deploy(...args),
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
    await new DeployVaultHelper__factory(await getFirstSigner()).deploy(...args),
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

  const uniswapAdapter__factory = await DRE.ethers.getContractFactory(
    uniswapAdapterArtifact.abi,
    linkedUniswapAdapterByteCode
  );

  const uniswapAdapter = await (
    await uniswapAdapter__factory.connect(await getFirstSigner()).deploy()
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

  const curveswapAdapter__factory = await DRE.ethers.getContractFactory(
    curveswapAdapterArtifact.abi,
    linkedCurveswapAdapterByteCode
  );

  const curveswapAdapter = await (
    await curveswapAdapter__factory.connect(await getFirstSigner()).deploy()
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

  const balancerswapAdapter__factory = await DRE.ethers.getContractFactory(
    balancerswapAdapterArtifact.abi,
    linkedBalancerswapAdapterByteCode
  );

  const balancerswapAdapter = await (
    await balancerswapAdapter__factory.connect(await getFirstSigner()).deploy()
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
    ['contracts/protocol/libraries/swap/BalancerswapAdapter.sol:BalancerswapAdapter']:
      balancerswapAdapter.address,
    ['contracts/protocol/libraries/swap/UniswapAdapter.sol:UniswapAdapter']: uniswapAdapter.address,
    ['contracts/protocol/libraries/swap/CurveswapAdapter.sol:CurveswapAdapter']:
      curveswapAdapter.address,
  };
};

export const deployYieldManagerImpl = async (verify?: boolean) => {
  const libraries = await deploySwapAdapterLibraries(verify);
  withSaveAndVerify(
    await new YieldManager__factory(libraries, await getFirstSigner()).deploy(),
    eContractid.YieldManagerImpl,
    [],
    verify
  );
};

export const deployYieldManager = async (verify?: boolean) => {
  const libraries = await deploySwapAdapterLibraries(verify);
  const yieldManagerImpl = await withSaveAndVerify(
    await new YieldManager__factory(libraries, await getFirstSigner()).deploy(),
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
    await new LeverageSwapManager__factory(await getFirstSigner()).deploy(),
    eContractid.LeverageSwapManagerImpl,
    [],
    verify
  );
};

export const deployLeverageSwapManager = async (verify?: boolean) => {
  const leverageManagerImpl = await withSaveAndVerify(
    await new LeverageSwapManager__factory(await getFirstSigner()).deploy(),
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
    await new ETHSTETHLevSwap__factory(await getFirstSigner()).deploy(...args),
    eContractid.ETHSTETHLevSwap,
    args,
    verify
  );

export const deployAURAWSTETHWETHLevSwap = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new AURAWSTETHWETHLevSwap__factory(await getFirstSigner()).deploy(...args),
    eContractid.AURAWSTETHWETHLevSwap,
    args,
    verify
  );

export const deploySturdyAPRDataProvider = async (args: [tEthereumAddress], verify?: boolean) =>
  withSaveAndVerify(
    await new SturdyAPRDataProvider__factory(await getFirstSigner()).deploy(...args),
    eContractid.SturdyAPRDataProvider,
    args,
    verify
  );
