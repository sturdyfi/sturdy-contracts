import { Contract } from 'ethers';
import { DRE, waitForTx } from './misc-utils';
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
import {
  AURABBAUSDLevSwap__factory,
  AURAOracle__factory,
  BALBBAUSDOracle__factory,
  DAIUSDCUSDTSUSDLevSwap2__factory,
  ERC4626Router__factory,
  ERC4626Vault__factory,
  FRAX3CRVLevSwap2__factory,
  FRAXUSDCLevSwap2__factory,
  MintableERC20,
  TUSDFRAXBPLevSwap2__factory,
  YieldDistributorAdapter__factory,
} from '../types';
import { MockContract } from 'ethereum-waffle';
import { ConfigNames, getReservesConfigByPool, loadPoolConfig } from './configuration';
import {
  getCollateralAdapter,
  // getBeefyVault,
  getFirstSigner,
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
  getYearnFBEETSVault,
  getYearnLINKVault,
  getBeefyETHVault,
  getBeefyMIM2CRVVault,
  getYearnCRVVault,
  getYearnSPELLVault,
  getBasedMiMaticBeefyVault,
  getYearnRETHWstETHVault,
  getConvexRocketPoolETHVault,
  getConvexFRAX3CRVVault,
  getConvexSTETHVault,
  getConvexDOLA3CRVVault,
  getYieldManager,
  getUniswapAdapterAddress,
  getCurveswapAdapterAddress,
  getStableYieldDistributionImpl,
  getLDOStableYieldDistribution,
  getConvexMIM3CRVVault,
  getConvexDAIUSDCUSDTSUSDVault,
  getConvexHBTCWBTCVault,
  getVariableYieldDistributionImpl,
  getVariableYieldDistribution,
  getConvexIronBankVault,
  getLeverageSwapManager,
  getConvexFRAXUSDCVault,
  getValidationLogic,
  getGenericLogic,
  getReserveLogicLibrary,
  getAuraDAIUSDCUSDTVault,
  getBalancerswapAdapterAddress,
  getConvexTUSDFRAXBPVault,
  getAuraBBAUSDVault,
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
  MintableDelegationERC20__factory,
  MintableERC20__factory,
  MockAggregator__factory,
  MockAToken__factory,
  MockStableDebtToken__factory,
  MockVariableDebtToken__factory,
  PriceOracle__factory,
  ReserveLogic__factory,
  StableDebtToken__factory,
  VariableDebtToken__factory,
  WETH9Mocked__factory,
  LendingPool__factory,
  LidoVault__factory,
  StakedTokenIncentivesController__factory,
  SturdyToken__factory,
  UiPoolDataProvider,
  WalletBalanceProvider__factory,
  UiIncentiveDataProvider__factory,
  Dai__factory,
  ATokenForCollateral__factory,
  YearnVault__factory,
  BeefyETHVault__factory,
  MockyvWFTM__factory,
  Usdc__factory,
  Usdt__factory,
  YearnWETHVault__factory,
  MockyvWETH__factory,
  MockWETHForFTM__factory,
  YearnWBTCVault__factory,
  MockyvWBTC__factory,
  MockWBTCForFTM__factory,
  CollateralAdapter__factory,
  YearnBOOVault__factory,
  BooOracle__factory,
  MockyvBOO__factory,
  MockBOOForFTM__factory,
  TombOracle__factory,
  TombFtmLPOracle__factory,
  TombFtmBeefyVault__factory,
  MockMooTOMBFTM__factory,
  TombMiMaticLPOracle__factory,
  TombMimaticBeefyVault__factory,
  MockMooTOMBMIMATIC__factory,
  FTMLiquidator__factory,
  ETHLiquidator__factory,
  YearnFBEETSVault__factory,
  FBeetsOracle__factory,
  BeetsOracle__factory,
  YearnLINKVault__factory,
  MockYearnVault__factory,
  MockBeefyVault__factory,
  YearnCRVVault__factory,
  YearnSPELLVault__factory,
  DeployVaultHelper__factory,
  BasedOracle__factory,
  BasedMiMaticLPOracle__factory,
  BasedMimaticBeefyVault__factory,
  MockMooBASEDMIMATIC__factory,
  YearnRETHWstETHVault__factory,
  CrvREthWstETHOracle__factory,
  ConvexCurveLPVault__factory,
  FRAX3CRVOracle__factory,
  STECRVOracle__factory,
  DOLA3CRVOracle__factory,
  YieldManager__factory,
  StableYieldDistribution__factory,
  MIM3CRVOracle__factory,
  DAIUSDCUSDTSUSDOracle__factory,
  VariableYieldDistribution__factory,
  HBTCWBTCOracle__factory,
  BeefyMIM2CRVVault__factory,
  MIM2CRVOracle__factory,
  IronBankOracle__factory,
  LeverageSwapManager__factory,
  FRAX3CRVLevSwap__factory,
  DAIUSDCUSDTSUSDLevSwap__factory,
  FRAXUSDCOracle__factory,
  MIM3CRVLevSwap__factory,
  IRONBANKLevSwap__factory,
  FRAXUSDCLevSwap__factory,
  SturdyAPRDataProvider__factory,
  AuraBalancerLPVault__factory,
  BALDAIUSDCUSDTOracle__factory,
  TUSDFRAXBPOracle__factory,
  TUSDFRAXBPLevSwap__factory,
  VaultWhitelist__factory,
  ConvexCurveLPVault2__factory,
  StaticAToken__factory,
  InitializableAdminUpgradeabilityProxy__factory,
} from '../types';
import {
  withSaveAndVerify,
  registerContractInJsonDb,
  linkBytecode,
  insertContractAddressInDb,
  getParamPerNetwork,
  deployContract,
  verifyContract,
  getContract,
} from './contracts-helpers';
import { StableAndVariableTokensHelper__factory } from '../types';
import { MintableDelegationERC20 } from '../types';
import { readArtifact as buidlerReadArtifact } from '@nomiclabs/buidler/plugins';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { LendingPoolLibraryAddresses } from '../types/factories/protocol/lendingpool/LendingPool__factory';
import { YieldManagerLibraryAddresses } from '../types/factories/incentives/YieldManager__factory';
import { LidoVaultLibraryAddresses } from '../types/factories/protocol/vault/ethereum/LidoVault__factory';
import { YearnRETHWstETHVaultLibraryAddresses } from '../types/factories/protocol/vault/ethereum/YearnRETHWstETHVault__factory';

const readArtifact = async (id: string) => {
  if (DRE.network.name === eEthereumNetwork.buidlerevm) {
    return buidlerReadArtifact(DRE.config.paths.artifacts, id);
  }
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
  return withSaveAndVerify(
    lendingPoolConfiguratorImpl,
    eContractid.LendingPoolConfiguratorImpl,
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
  return withSaveAndVerify(lendingPoolImpl, eContractid.LendingPoolImpl, [], verify);
};

export const deployPriceOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new PriceOracle__factory(await getFirstSigner()).deploy(),
    eContractid.PriceOracle,
    [],
    verify
  );

export const deployLendingRateOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new LendingRateOracle__factory(await getFirstSigner()).deploy(),
    eContractid.LendingRateOracle,
    [],
    verify
  );

export const deployMockAggregator = async (price: tStringTokenSmallUnits, verify?: boolean) =>
  withSaveAndVerify(
    await new MockAggregator__factory(await getFirstSigner()).deploy(price),
    eContractid.MockAggregator,
    [price],
    verify
  );

export const deploySturdyOracle = async (
  args: [tEthereumAddress[], tEthereumAddress[], tEthereumAddress, tEthereumAddress, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new SturdyOracle__factory(await getFirstSigner()).deploy(...args),
    eContractid.SturdyOracle,
    args,
    verify
  );

export const deployBooOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BooOracle__factory(await getFirstSigner()).deploy(),
    eContractid.BooOracle,
    [],
    verify
  );

export const deployTombOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new TombOracle__factory(await getFirstSigner()).deploy(),
    eContractid.TombOracle,
    [],
    verify
  );

export const deployTombFtmLPOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new TombFtmLPOracle__factory(await getFirstSigner()).deploy(),
    eContractid.TombFtmLPOracle,
    [],
    verify
  );

export const deployTombMiMaticLPOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new TombMiMaticLPOracle__factory(await getFirstSigner()).deploy(),
    eContractid.TombMiMaticLPOracle,
    [],
    verify
  );

export const deployFBeetsOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new FBeetsOracle__factory(await getFirstSigner()).deploy(),
    eContractid.FBeetsOracle,
    [],
    verify
  );

export const deployBeetsOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BeetsOracle__factory(await getFirstSigner()).deploy(),
    eContractid.BeetsOracle,
    [],
    verify
  );

export const deployBasedOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BasedOracle__factory(await getFirstSigner()).deploy(),
    eContractid.BasedOracle,
    [],
    verify
  );

export const deployBasedMiMaticLPOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BasedMiMaticLPOracle__factory(await getFirstSigner()).deploy(),
    eContractid.BasedMiMaticLPOracle,
    [],
    verify
  );

export const deployMIM2CRVLPOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new MIM2CRVOracle__factory(await getFirstSigner()).deploy(),
    eContractid.MIM2CRVOracle,
    [],
    verify
  );

export const deployRETHWstETHLPOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new CrvREthWstETHOracle__factory(await getFirstSigner()).deploy(),
    eContractid.RETHWstETHLPOracle,
    [],
    verify
  );

export const deployFRAX3CRVPOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new FRAX3CRVOracle__factory(await getFirstSigner()).deploy(),
    eContractid.FRAX3CRVOracle,
    [],
    verify
  );

export const deploySTECRVOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new STECRVOracle__factory(await getFirstSigner()).deploy(),
    eContractid.STECRVOracle,
    [],
    verify
  );

export const deployDOLA3CRVOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new DOLA3CRVOracle__factory(await getFirstSigner()).deploy(),
    eContractid.DOLA3CRVOracle,
    [],
    verify
  );

export const deployMIM3CRVPOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new MIM3CRVOracle__factory(await getFirstSigner()).deploy(),
    eContractid.MIM3CRVOracle,
    [],
    verify
  );

export const deployDAIUSDCUSDTSUSDOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new DAIUSDCUSDTSUSDOracle__factory(await getFirstSigner()).deploy(),
    eContractid.DAIUSDCUSDTSUSDOracle,
    [],
    verify
  );

export const deployHBTCWBTCOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new HBTCWBTCOracle__factory(await getFirstSigner()).deploy(),
    eContractid.HBTCWBTCOracle,
    [],
    verify
  );

export const deployIronBankOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new IronBankOracle__factory(await getFirstSigner()).deploy(),
    eContractid.IronBankOracle,
    [],
    verify
  );

export const deployFRAXUSDCOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new FRAXUSDCOracle__factory(await getFirstSigner()).deploy(),
    eContractid.FRAXUSDCOracle,
    [],
    verify
  );

export const deployBALDAIUSDCUSDTOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BALDAIUSDCUSDTOracle__factory(await getFirstSigner()).deploy(),
    eContractid.BALDAIUSDCUSDTOracle,
    [],
    verify
  );

export const deployTUSDFRAXBPCOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new TUSDFRAXBPOracle__factory(await getFirstSigner()).deploy(),
    eContractid.TUSDFRAXBPOracle,
    [],
    verify
  );

export const deployBALBBAUSDOracle = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BALBBAUSDOracle__factory(await getFirstSigner()).deploy(),
    eContractid.BALBBAUSDOracle,
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

export const deployMintableERC20 = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MintableERC20> =>
  withSaveAndVerify(
    await new MintableERC20__factory(await getFirstSigner()).deploy(...args),
    eContractid.MintableERC20,
    args,
    verify
  );

export const deployMintableDelegationERC20 = async (
  args: [string, string, string],
  verify?: boolean
): Promise<MintableDelegationERC20> =>
  withSaveAndVerify(
    await new MintableDelegationERC20__factory(await getFirstSigner()).deploy(...args),
    eContractid.MintableDelegationERC20,
    args,
    verify
  );
export const deployDefaultReserveInterestRateStrategy = async (
  args: [tEthereumAddress, string, string, string, string, string, string, string],
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

export const deployMockStableDebtToken = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress, string, string, string],
  verify?: boolean
) => {
  const instance = await withSaveAndVerify(
    await new MockStableDebtToken__factory(await getFirstSigner()).deploy(),
    eContractid.MockStableDebtToken,
    [],
    verify
  );

  await instance.initialize(args[0], args[1], args[2], '18', args[3], args[4], args[5]);

  return instance;
};

export const deployWETHMocked = async (verify?: boolean) =>
  withSaveAndVerify(
    await new WETH9Mocked__factory(await getFirstSigner()).deploy(),
    eContractid.WETHMocked,
    [],
    verify
  );

export const deployMockVariableDebtToken = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress, string, string, string],
  verify?: boolean
) => {
  const instance = await withSaveAndVerify(
    await new MockVariableDebtToken__factory(await getFirstSigner()).deploy(),
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
    await new MockAToken__factory(await getFirstSigner()).deploy(),
    eContractid.MockAToken,
    [],
    verify
  );

  await instance.initialize(args[0], args[2], args[1], args[3], '18', args[4], args[5], args[6]);

  return instance;
};

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

export const deployLidoVaultLibraries = async (
  verify?: boolean
): Promise<LidoVaultLibraryAddresses> => {
  const curveswapAdapter = await deployCurveswapAdapterLibrary(verify);

  return {
    ['contracts/protocol/libraries/swap/CurveswapAdapter.sol:CurveswapAdapter']:
      curveswapAdapter.address,
  };
};

export const deployLidoVaultImpl = async (verify?: boolean) => {
  const libraries = await deployLidoVaultLibraries(verify);
  return withSaveAndVerify(
    await new LidoVault__factory(libraries, await getFirstSigner()).deploy(),
    eContractid.LidoVaultImpl,
    [],
    verify
  );
};

export const deployLidoVault = async (verify?: boolean) => {
  const libraries = await deployLidoVaultLibraries(verify);
  const lidoVaultImpl = await withSaveAndVerify(
    await new LidoVault__factory(libraries, await getFirstSigner()).deploy(),
    eContractid.LidoVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await lidoVaultImpl.initialize(addressesProvider.address));
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
      DRE.ethers.utils.formatBytes32String('STETH_ETH_POOL'),
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

export const deployYearnRETHWstETHVaultLibraries = async (
  verify?: boolean
): Promise<YearnRETHWstETHVaultLibraryAddresses> => {
  const curveswapAdapter = await deployCurveswapAdapterLibrary(verify);

  return {
    ['contracts/protocol/libraries/swap/CurveswapAdapter.sol:CurveswapAdapter']:
      curveswapAdapter.address,
  };
};

export const deployYearnRETHWstETHVaultImpl = async (verify?: boolean) => {
  const libraries = await deployYearnRETHWstETHVaultLibraries(verify);
  withSaveAndVerify(
    await new YearnRETHWstETHVault__factory(libraries, await getFirstSigner()).deploy(),
    eContractid.YearnRETHWstETHVaultImpl,
    [],
    verify
  );
};

export const deployYearnRETHWstETHVaultVault = async (verify?: boolean) => {
  const libraries = await deployYearnRETHWstETHVaultLibraries(verify);
  const vaultImpl = await withSaveAndVerify(
    await new YearnRETHWstETHVault__factory(libraries, await getFirstSigner()).deploy(),
    eContractid.YearnRETHWstETHVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('YEARN_RETH_WSTETH_VAULT'),
      vaultImpl.address
    )
  );

  const config: ISturdyConfiguration = loadPoolConfig(ConfigNames.Sturdy) as ISturdyConfiguration;
  const network = <eNetwork>DRE.network.name;

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('YVRETH_WSTETH'),
      getParamPerNetwork(config.YearnRETHWstETHVault, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('RETH_WSTETH'),
      getParamPerNetwork(config.RETH_WSTETH_LP, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('WSTETH'),
      getParamPerNetwork(config.WSTETH, network)
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('YEARN_RETH_WSTETH_VAULT')
  );
  await insertContractAddressInDb(eContractid.YearnRETHWstETHVault, proxyAddress);

  return await getYearnRETHWstETHVault();
};

export const deployConvexRocketPoolETHVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexRocketPoolETHVaulttImpl,
    [],
    verify
  );

export const deployConvexRocketPoolETHVault = async (verify?: boolean) => {
  const config: ISturdyConfiguration = loadPoolConfig(ConfigNames.Sturdy) as ISturdyConfiguration;
  const network = <eNetwork>DRE.network.name;

  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexRocketPoolETHVaulttImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_ROCKET_POOL_ETH_VAULT'),
      vaultImpl.address
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('RETH_WSTETH'),
      getParamPerNetwork(config.RETH_WSTETH_LP, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('WSTETH'),
      getParamPerNetwork(config.WSTETH, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('CRV'),
      getParamPerNetwork(config.CRV, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('CVX'),
      getParamPerNetwork(config.CVX, network)
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_ROCKET_POOL_ETH_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexRocketPoolETHVault, proxyAddress);

  return await getConvexRocketPoolETHVault();
};

export const deployConvexFRAX3CRVVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexFRAX3CRVVaultImpl,
    [],
    verify
  );

export const deployConvexFRAX3CRVVault = async (verify?: boolean) => {
  const config: ISturdyConfiguration = loadPoolConfig(ConfigNames.Sturdy) as ISturdyConfiguration;
  const network = <eNetwork>DRE.network.name;

  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexFRAX3CRVVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_FRAX_3CRV_VAULT'),
      vaultImpl.address
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('CRV'),
      getParamPerNetwork(config.CRV, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('CVX'),
      getParamPerNetwork(config.CVX, network)
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_FRAX_3CRV_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexFRAX3CRVVault, proxyAddress);

  return await getConvexFRAX3CRVVault();
};

export const deployConvexSTETHVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexSTETHVaultImpl,
    [],
    verify
  );

export const deployConvexSTETHVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexSTETHVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_STETH_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_STETH_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexSTETHVault, proxyAddress);

  return await getConvexSTETHVault();
};

export const deployConvexDOLA3CRVVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexDOLA3CRVVaultImpl,
    [],
    verify
  );

export const deployConvexDOLA3CRVVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexDOLA3CRVVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_DOLA_3CRV_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_DOLA_3CRV_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexDOLA3CRVVault, proxyAddress);

  return await getConvexDOLA3CRVVault();
};

export const deployConvexMIM3CRVVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexMIM3CRVVaultImpl,
    [],
    verify
  );

export const deployConvexMIM3CRVVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexMIM3CRVVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_MIM_3CRV_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_MIM_3CRV_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexMIM3CRVVault, proxyAddress);

  return await getConvexMIM3CRVVault();
};

export const deployConvexDAIUSDCUSDTSUSDVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexDAIUSDCUSDTSUSDVaultImpl,
    [],
    verify
  );

export const deployConvexDAIUSDCUSDTSUSDVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexDAIUSDCUSDTSUSDVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_DAI_USDC_USDT_SUSD_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_DAI_USDC_USDT_SUSD_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexDAIUSDCUSDTSUSDVault, proxyAddress);

  return await getConvexDAIUSDCUSDTSUSDVault();
};

export const deployConvexHBTCWBTCVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexHBTCWBTCVaultImpl,
    [],
    verify
  );

export const deployConvexHBTCWBTCVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexHBTCWBTCVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_HBTC_WBTC_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_HBTC_WBTC_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexHBTCWBTCVault, proxyAddress);

  return await getConvexHBTCWBTCVault();
};

export const deployConvexIronBankVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexIronBankVaultImpl,
    [],
    verify
  );

export const deployConvexIronBankVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexIronBankVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_IRON_BANK_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_IRON_BANK_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexIronBankVault, proxyAddress);

  return await getConvexIronBankVault();
};

export const deployConvexFRAXUSDCVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexFRAXUSDCVaultImpl,
    [],
    verify
  );

export const deployConvexFRAXUSDCVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexFRAXUSDCVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_FRAX_USDC_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_FRAX_USDC_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexFRAXUSDCVault, proxyAddress);

  return await getConvexFRAXUSDCVault();
};

export const deployAuraDAIUSDCUSDTVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new AuraBalancerLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.AuraDAIUSDCUSDTVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('AURA_DAI_USDC_USDT_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('AURA_DAI_USDC_USDT_VAULT')
  );
  await insertContractAddressInDb(eContractid.AuraDAIUSDCUSDTVault, proxyAddress);

  return await getAuraDAIUSDCUSDTVault();
};

export const deployConvexTUSDFRAXBPVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ConvexCurveLPVault2__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexTUSDFRAXBPVaultImpl,
    [],
    verify
  );

export const deployConvexTUSDFRAXBPVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new ConvexCurveLPVault2__factory(await getFirstSigner()).deploy(),
    eContractid.ConvexTUSDFRAXBPVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('CONVEX_TUSD_FRAXBP_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('CONVEX_TUSD_FRAXBP_VAULT')
  );
  await insertContractAddressInDb(eContractid.ConvexTUSDFRAXBPVault, proxyAddress);

  return await getConvexTUSDFRAXBPVault();
};

export const deployAuraBBAUSDVault = async (verify?: boolean) => {
  const vaultImpl = await withSaveAndVerify(
    await new AuraBalancerLPVault__factory(await getFirstSigner()).deploy(),
    eContractid.AuraBBAUSDVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(await vaultImpl.initialize(addressesProvider.address));
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('AURA_BB_A_USD_VAULT'),
      vaultImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('AURA_BB_A_USD_VAULT')
  );
  await insertContractAddressInDb(eContractid.AuraBBAUSDVault, proxyAddress);

  return await getAuraBBAUSDVault();
};

export const deployYearnVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new YearnVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnVaultImpl,
    [],
    verify
  );

export const deployYearnVault = async (verify?: boolean) => {
  const yearnVaultImpl = await withSaveAndVerify(
    await new YearnVault__factory(await getFirstSigner()).deploy(),
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
    await new YearnWETHVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnWETHVaultImpl,
    [],
    verify
  );

export const deployYearnWETHVault = async (verify?: boolean) => {
  const yearnWETHVaultImpl = await withSaveAndVerify(
    await new YearnWETHVault__factory(await getFirstSigner()).deploy(),
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
    await new YearnWBTCVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnWBTCVaultImpl,
    [],
    verify
  );

export const deployYearnWBTCVault = async (verify?: boolean) => {
  const yearnWBTCVaultImpl = await withSaveAndVerify(
    await new YearnWBTCVault__factory(await getFirstSigner()).deploy(),
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
    await new YearnBOOVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnBOOVaultImpl,
    [],
    verify
  );

export const deployYearnBOOVault = async (verify?: boolean) => {
  const yearnBOOVaultImpl = await withSaveAndVerify(
    await new YearnBOOVault__factory(await getFirstSigner()).deploy(),
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
    await new TombFtmBeefyVault__factory(await getFirstSigner()).deploy(),
    eContractid.TombFtmBeefyVaultImpl,
    [],
    verify
  );

export const deployTombFTMBeefyVault = async (verify?: boolean) => {
  const tombFtmBeefyVaultImpl = await withSaveAndVerify(
    await new TombFtmBeefyVault__factory(await getFirstSigner()).deploy(),
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
    await new TombMimaticBeefyVault__factory(await getFirstSigner()).deploy(),
    eContractid.TombMiMaticBeefyVaultImpl,
    [],
    verify
  );

export const deployTombMiMaticBeefyVault = async (verify?: boolean) => {
  const tombMiMaticBeefyVaultImpl = await withSaveAndVerify(
    await new TombMimaticBeefyVault__factory(await getFirstSigner()).deploy(),
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

export const deployBasedMiMaticBeefyVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BasedMimaticBeefyVault__factory(await getFirstSigner()).deploy(),
    eContractid.BasedMiMaticBeefyVaultImpl,
    [],
    verify
  );

export const deployBasedMiMaticBeefyVault = async (verify?: boolean) => {
  const basedMiMaticBeefyVaultImpl = await withSaveAndVerify(
    await new BasedMimaticBeefyVault__factory(await getFirstSigner()).deploy(),
    eContractid.BasedMiMaticBeefyVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('BEEFY_BASED_MIMATIC_VAULT'),
      basedMiMaticBeefyVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('mooTombBASED-MIMATIC'),
      getParamPerNetwork(config.BeefyVaultBASED_MIMATIC, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('BASED_MIMATIC_LP'),
      getParamPerNetwork(config.BASED_MIMATIC_LP, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('BASED'),
      getParamPerNetwork(config.BASED, network)
    )
  );

  const basedMiMaticBeefyVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('BEEFY_BASED_MIMATIC_VAULT')
  );
  await insertContractAddressInDb(
    eContractid.BasedMiMaticBeefyVault,
    basedMiMaticBeefyVaultProxyAddress
  );

  return await getBasedMiMaticBeefyVault();
};

export const deployBeefyMIM2CRVVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new BeefyMIM2CRVVault__factory(await getFirstSigner()).deploy(),
    eContractid.BeefyMIM2CRVVaultImpl,
    [],
    verify
  );

export const deployBeefyMIM2CRVVault = async (verify?: boolean) => {
  const beefyMIM2CRVVaultImpl = await withSaveAndVerify(
    await new BeefyMIM2CRVVault__factory(await getFirstSigner()).deploy(),
    eContractid.BeefyMIM2CRVVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('BEEFY_MIM2CRV_VAULT'),
      beefyMIM2CRVVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('MOOMIM2CRV'),
      getParamPerNetwork(config.BeefyMIM2CRVVault, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('MIM_2CRV_LP'),
      getParamPerNetwork(config.MIM_2CRV_LP, network)
    )
  );

  const beefyMIM2CRVVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('BEEFY_MIM2CRV_VAULT')
  );
  await insertContractAddressInDb(eContractid.BeefyMIM2CRVVault, beefyMIM2CRVVaultProxyAddress);

  return await getBeefyMIM2CRVVault();
};

export const deployYearnFBeetsVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new YearnFBEETSVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnFBEETSVaultImpl,
    [],
    verify
  );

export const deployYearnFBeetsVault = async (verify?: boolean) => {
  const yearnFBEETSVaultImpl = await withSaveAndVerify(
    await new YearnFBEETSVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnFBEETSVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('YEARN_FBEETS_VAULT'),
      yearnFBEETSVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('YVFBEETS'),
      getParamPerNetwork(config.YearnFBEETSVaultFTM, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('fBEETS'),
      getParamPerNetwork(config.fBEETS, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('BEETS'),
      getParamPerNetwork(config.BEETS, network)
    )
  );

  const yearnFBEETSVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('YEARN_FBEETS_VAULT')
  );
  await insertContractAddressInDb(eContractid.YearnFBEETSVault, yearnFBEETSVaultProxyAddress);

  return await getYearnFBEETSVault();
};

export const deployYearnLINKVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new YearnLINKVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnLINKVaultImpl,
    [],
    verify
  );

export const deployYearnLINKVault = async (verify?: boolean) => {
  const yearnLINKVaultImpl = await withSaveAndVerify(
    await new YearnLINKVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnLINKVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('YEARN_LINK_VAULT'),
      yearnLINKVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('YVLINK'),
      getParamPerNetwork(config.YearnLINKVaultFTM, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('LINK'),
      getParamPerNetwork(config.LINK, network)
    )
  );

  const yearnLINKVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('YEARN_LINK_VAULT')
  );
  await insertContractAddressInDb(eContractid.YearnLINKVault, yearnLINKVaultProxyAddress);

  return await getYearnLINKVault();
};

export const deployBeefyETHVault = async (verify?: boolean) => {
  const beefyETHVault = await withSaveAndVerify(
    await new BeefyETHVault__factory(await getFirstSigner()).deploy(),
    eContractid.BeefyETHVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('BEEFY_ETH_VAULT'),
      beefyETHVault.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('MOOWETH'),
      getParamPerNetwork(config.BeefyETHVault, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('WETH'),
      getParamPerNetwork(config.WETH, network)
    )
  );

  const beefyVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('BEEFY_ETH_VAULT')
  );
  await insertContractAddressInDb(eContractid.BeefyETHVault, beefyVaultProxyAddress);

  return await getBeefyETHVault();
};

export const deployYearnCRVVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new YearnCRVVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnCRVVaultImpl,
    [],
    verify
  );

export const deployYearnCRVVault = async (verify?: boolean) => {
  const yearnCRVVaultImpl = await withSaveAndVerify(
    await new YearnCRVVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnCRVVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('YEARN_CRV_VAULT'),
      yearnCRVVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('YVCRV'),
      getParamPerNetwork(config.YearnCRVVaultFTM, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('CRV'),
      getParamPerNetwork(config.CRV, network)
    )
  );

  const yearnCRVVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('YEARN_CRV_VAULT')
  );
  await insertContractAddressInDb(eContractid.YearnCRVVault, yearnCRVVaultProxyAddress);

  return await getYearnCRVVault();
};

export const deployYearnSPELLVaultImpl = async (verify?: boolean) =>
  withSaveAndVerify(
    await new YearnSPELLVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnSPELLVaultImpl,
    [],
    verify
  );

export const deployYearnSPELLVault = async (verify?: boolean) => {
  const yearnSPELLVaultImpl = await withSaveAndVerify(
    await new YearnSPELLVault__factory(await getFirstSigner()).deploy(),
    eContractid.YearnSPELLVaultImpl,
    [],
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('YEARN_SPELL_VAULT'),
      yearnSPELLVaultImpl.address
    )
  );

  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('YVSPELL'),
      getParamPerNetwork(config.YearnSPELLVaultFTM, network)
    )
  );

  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('SPELL'),
      getParamPerNetwork(config.SPELL, network)
    )
  );

  const yearnSPELLVaultProxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('YEARN_SPELL_VAULT')
  );
  await insertContractAddressInDb(eContractid.YearnSPELLVault, yearnSPELLVaultProxyAddress);

  return await getYearnSPELLVault();
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
  // await waitForTx(
  //   await incentiveTokenImpl.initialize(addressesProvider.address)
  // )
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

export const deployLDOStableYieldDistribution = async () => {
  const stableYieldDistributionImpl = await getStableYieldDistributionImpl();
  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddressAsProxy(
      DRE.ethers.utils.formatBytes32String('LDO_STABLE_YIELD_DISTRIBUTOR'),
      stableYieldDistributionImpl.address
    )
  );

  const proxyAddress = await addressesProvider.getAddress(
    DRE.ethers.utils.formatBytes32String('LDO_STABLE_YIELD_DISTRIBUTOR')
  );
  await insertContractAddressInDb(eContractid.LDOStableYieldDistribution, proxyAddress);

  return await getLDOStableYieldDistribution();
};

export const deployYieldDistributorAdapter = async (args: [string], verify?: boolean) => {
  const impl = await withSaveAndVerify(
    await new YieldDistributorAdapter__factory(await getFirstSigner()).deploy(...args),
    eContractid.YieldDistributorAdapter,
    args,
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('YIELD_DISTRIBUTOR_ADAPTER'),
      impl.address
    )
  );

  return impl;
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

export const deployMockDai = async (chainId: any, verify?: boolean) =>
  withSaveAndVerify(
    await new Dai__factory(await getFirstSigner()).deploy(chainId),
    eContractid.DAIToken,
    [chainId],
    verify
  );

export const deployMockUSDC = async (args: [string, string, any, string], verify?: boolean) =>
  withSaveAndVerify(
    await new Usdc__factory(await getFirstSigner()).deploy(...args),
    eContractid.USDCToken,
    args,
    verify
  );

export const deployMockUSDT = async (args: [string, string, any, string], verify?: boolean) =>
  withSaveAndVerify(
    await new Usdt__factory(await getFirstSigner()).deploy(...args),
    eContractid.USDTToken,
    args,
    verify
  );

export const deployMockyvWFTM = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockyvWFTM__factory(await getFirstSigner()).deploy(...args),
    eContractid.MockyvWFTM,
    args,
    verify
  );

export const deployMockyvWETH = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockyvWETH__factory(await getFirstSigner()).deploy(...args),
    eContractid.MockyvWETH,
    args,
    verify
  );

export const deployMockyvWBTC = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockyvWBTC__factory(await getFirstSigner()).deploy(...args),
    eContractid.MockyvWBTC,
    args,
    verify
  );

export const deployMockyvBOO = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockyvBOO__factory(await getFirstSigner()).deploy(...args),
    eContractid.MockyvBOO,
    args,
    verify
  );

export const deployMockWETHForFTM = async (
  args: [string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockWETHForFTM__factory(await getFirstSigner()).deploy(...args),
    eContractid.MockWETHForFTM,
    args,
    verify
  );

export const deployMockWBTCForFTM = async (
  args: [string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockWBTCForFTM__factory(await getFirstSigner()).deploy(...args),
    eContractid.MockWBTCForFTM,
    args,
    verify
  );

export const deployMockBOOForFTM = async (
  args: [string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockBOOForFTM__factory(await getFirstSigner()).deploy(...args),
    eContractid.MockBOOForFTM,
    args,
    verify
  );

export const deployMockMooTOMBFTM = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockMooTOMBFTM__factory(await getFirstSigner()).deploy(...args),
    eContractid.MockMooTOMBFTM,
    args,
    verify
  );

export const deployMockMooTOMBMIMATIC = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockMooTOMBMIMATIC__factory(await getFirstSigner()).deploy(...args),
    eContractid.MockMooTOMBMIMATIC,
    args,
    verify
  );

export const deployMockMooBASEDMIMATIC = async (
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockMooBASEDMIMATIC__factory(await getFirstSigner()).deploy(...args),
    eContractid.MockMooBASEDMIMATIC,
    args,
    verify
  );

export const deployMockYearnVault = async (
  id: string,
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockYearnVault__factory(await getFirstSigner()).deploy(...args),
    id,
    args,
    verify
  );

export const deployMockBeefyVault = async (
  id: string,
  args: [string, string, string, string, string, string, string],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MockBeefyVault__factory(await getFirstSigner()).deploy(...args),
    id,
    args,
    verify
  );

export const deployFTMLiquidator = async (args: [string], verify?: boolean) => {
  const liquidator = await withSaveAndVerify(
    await new FTMLiquidator__factory(await getFirstSigner()).deploy(...args),
    eContractid.FTMLiquidator,
    args,
    verify
  );

  const addressesProvider = await getLendingPoolAddressesProvider();
  const config: IFantomConfiguration = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = <eNetwork>DRE.network.name;
  await waitForTx(
    await addressesProvider.setAddress(
      DRE.ethers.utils.formatBytes32String('AAVE_LENDING_POOL'),
      getParamPerNetwork(config.AavePool, network)
    )
  );

  return liquidator;
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

  const config: ISturdyConfiguration = loadPoolConfig(ConfigNames.Sturdy) as ISturdyConfiguration;
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
  const config: ISturdyConfiguration = loadPoolConfig(ConfigNames.Sturdy) as ISturdyConfiguration;
  const network = <eNetwork>DRE.network.name;

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

export const deployFRAX3CRVLevSwap = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new FRAX3CRVLevSwap__factory(await getFirstSigner()).deploy(...args),
    eContractid.FRAX3CRVLevSwap,
    args,
    verify
  );

export const deployFRAX3CRVLevSwap2 = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) => {
  const libraries = await deploySwapAdapterLibraries(verify);

  const levSwap = await withSaveAndVerify(
    await new FRAX3CRVLevSwap2__factory(libraries, await getFirstSigner()).deploy(...args),
    eContractid.FRAX3CRVLevSwap,
    args,
    verify
  );

  return levSwap;
};

export const deployDAIUSDCUSDTSUSDLevSwap = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new DAIUSDCUSDTSUSDLevSwap__factory(await getFirstSigner()).deploy(...args),
    eContractid.DAIUSDCUSDTSUSDLevSwap,
    args,
    verify
  );

export const deployDAIUSDCUSDTSUSDLevSwap2 = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) => {
  const libraries = await deploySwapAdapterLibraries(verify);

  const levSwap = await withSaveAndVerify(
    await new DAIUSDCUSDTSUSDLevSwap2__factory(libraries, await getFirstSigner()).deploy(...args),
    eContractid.DAIUSDCUSDTSUSDLevSwap2,
    args,
    verify
  );

  return levSwap;
};

export const deployMIM3CRVLevSwap = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new MIM3CRVLevSwap__factory(await getFirstSigner()).deploy(...args),
    eContractid.MIM3CRVLevSwap,
    args,
    verify
  );

export const deployIRONBANKLevSwap = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) =>
  withSaveAndVerify(
    await new IRONBANKLevSwap__factory(await getFirstSigner()).deploy(...args),
    eContractid.IRONBANKLevSwap,
    args,
    verify
  );

export const deployFRAXUSDCLevSwap = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) => {
  const libraries = await deploySwapAdapterLibraries(verify);

  const levSwap = await withSaveAndVerify(
    await new FRAXUSDCLevSwap__factory(libraries, await getFirstSigner()).deploy(...args),
    eContractid.FRAXUSDCLevSwap,
    args,
    verify
  );

  return levSwap;
};

export const deployFRAXUSDCLevSwap2 = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) => {
  const libraries = await deploySwapAdapterLibraries(verify);

  const levSwap = await withSaveAndVerify(
    await new FRAXUSDCLevSwap2__factory(libraries, await getFirstSigner()).deploy(...args),
    eContractid.FRAXUSDCLevSwap2,
    args,
    verify
  );

  return levSwap;
};

export const deployTUSDFRAXBPLevSwap = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) => {
  const libraries = await deploySwapAdapterLibraries(verify);

  const levSwap = await withSaveAndVerify(
    await new TUSDFRAXBPLevSwap__factory(libraries, await getFirstSigner()).deploy(...args),
    eContractid.TUSDFRAXBPLevSwap,
    args,
    verify
  );

  return levSwap;
};

export const deployTUSDFRAXBPLevSwap2 = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) => {
  const libraries = await deploySwapAdapterLibraries(verify);

  const levSwap = await withSaveAndVerify(
    await new TUSDFRAXBPLevSwap2__factory(libraries, await getFirstSigner()).deploy(...args),
    eContractid.TUSDFRAXBPLevSwap2,
    args,
    verify
  );

  return levSwap;
};

export const deployAURABBAUSDLevSwap = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  verify?: boolean
) => {
  const libraries = await deploySwapAdapterLibraries(verify);

  const levSwap = await withSaveAndVerify(
    await new AURABBAUSDLevSwap__factory(libraries, await getFirstSigner()).deploy(...args),
    eContractid.AURABBAUSDLevSwap,
    args,
    verify
  );

  return levSwap;
};

export const deploySturdyAPRDataProvider = async (args: [tEthereumAddress], verify?: boolean) =>
  withSaveAndVerify(
    await new SturdyAPRDataProvider__factory(await getFirstSigner()).deploy(...args),
    eContractid.SturdyAPRDataProvider,
    args,
    verify
  );

export const deployVaultWhitelist = async (verify?: boolean) =>
  withSaveAndVerify(
    await new VaultWhitelist__factory(await getFirstSigner()).deploy(),
    eContractid.VaultWhitelist,
    [],
    verify
  );

export const deployInitializableAdminUpgradeabilityProxy = async (verify?: boolean) =>
  withSaveAndVerify(
    await new InitializableAdminUpgradeabilityProxy__factory(await getFirstSigner()).deploy(),
    eContractid.InitializableAdminUpgradeabilityProxy,
    [],
    verify
  );

export const deployStaticAToken = async (
  [pool, aTokenAddress, symbol, proxyAdmin]: [
    tEthereumAddress,
    tEthereumAddress,
    string,
    tEthereumAddress
  ],
  verify?: boolean
) => {
  const args: [string, string, string, string] = [pool, aTokenAddress, `Wrapped ${symbol}`, symbol];

  const staticATokenImplementation = await withSaveAndVerify(
    await new StaticAToken__factory(await getFirstSigner()).deploy(),
    symbol + eContractid.StaticATokenImpl,
    [],
    verify
  );

  const proxy = await deployInitializableAdminUpgradeabilityProxy(verify);

  await registerContractInJsonDb(symbol + eContractid.StaticAToken, proxy);
  const encodedInitializedParams = staticATokenImplementation.interface.encodeFunctionData(
    'initialize',
    [...args]
  );

  // Initialize implementation to prevent others to do it
  await waitForTx(await staticATokenImplementation.initialize(...args));

  // Initialize proxy
  await waitForTx(
    await proxy['initialize(address,address,bytes)'](
      staticATokenImplementation.address,
      proxyAdmin,
      encodedInitializedParams
    )
  );

  return { proxy: proxy.address, implementation: staticATokenImplementation.address };
};

export const deployERC4626Vault = async (
  args: [tEthereumAddress, tEthereumAddress, tEthereumAddress],
  assetSymbol: string,
  verify?: boolean
) =>
  withSaveAndVerify(
    await new ERC4626Vault__factory(await getFirstSigner()).deploy(...args),
    eContractid.ERC4626Vault + assetSymbol.toUpperCase(),
    args,
    verify
  );

export const deployERC4626Router = async (verify?: boolean) =>
  withSaveAndVerify(
    await new ERC4626Router__factory(await getFirstSigner()).deploy(),
    eContractid.ERC4626Router,
    [],
    verify
  );
