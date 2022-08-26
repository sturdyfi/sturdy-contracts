import {
  evmRevert,
  evmSnapshot,
  DRE,
  impersonateAccountsHardhat,
} from '../../../helpers/misc-utils';
import { Signer } from 'ethers';
import {
  getLendingPool,
  getLendingPoolAddressesProvider,
  getSturdyProtocolDataProvider,
  getAToken,
  getMintableERC20,
  getLendingPoolConfiguratorProxy,
  getPriceOracle,
  getLendingPoolAddressesProviderRegistry,
  getLidoVault,
  getSturdyIncentivesController,
  getSturdyToken,
  getFirstSigner,
  getYearnRETHWstETHVault,
  getConvexRocketPoolETHVault,
  getETHLiquidator,
  getConvexFRAX3CRVVault,
  getConvexSTETHVault,
  getConvexDOLA3CRVVault,
  getYieldManager,
  getConvexMIM3CRVVault,
  getConvexDAIUSDCUSDTSUSDVault,
  getConvexHBTCWBTCVault,
  getVariableYieldDistribution,
  getConvexIronBankVault,
  getLeverageSwapManager,
  getConvexFRAXUSDCVault,
} from '../../../helpers/contracts-getters';
import { eNetwork, ISturdyConfiguration, tEthereumAddress } from '../../../helpers/types';
import { LendingPool } from '../../../types/LendingPool';
import { SturdyProtocolDataProvider } from '../../../types/SturdyProtocolDataProvider';
import { MintableERC20 } from '../../../types/MintableERC20';
import { AToken } from '../../../types/AToken';
import { LendingPoolConfigurator } from '../../../types/LendingPoolConfigurator';

import chai from 'chai';
// @ts-ignore
import bignumberChai from 'chai-bignumber';
import { almostEqual } from './almost-equal';
import { PriceOracle } from '../../../types/PriceOracle';
import { LendingPoolAddressesProvider } from '../../../types/LendingPoolAddressesProvider';
import { LendingPoolAddressesProviderRegistry } from '../../../types/LendingPoolAddressesProviderRegistry';
import { getEthersSigners } from '../../../helpers/contracts-helpers';
import { getParamPerNetwork } from '../../../helpers/contracts-helpers';
import { solidity } from 'ethereum-waffle';
import { SturdyConfig } from '../../../markets/sturdy';
import {
  LidoVault,
  StakedTokenIncentivesController,
  SturdyToken,
  YearnRETHWstETHVault,
  ConvexCurveLPVault,
  SturdyInternalAssetFactory,
  YieldManager,
  VariableYieldDistribution,
  LeverageSwapManager,
} from '../../../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { usingTenderly } from '../../../helpers/tenderly-utils';
import { ILido } from '../../../types/ILido';
import { ILidoFactory } from '../../../types/ILidoFactory';
import { ConfigNames, loadPoolConfig } from '../../../helpers/configuration';
import { parseEther } from '@ethersproject/units';
import { IERC20Detailed } from '../../../types/IERC20Detailed';
import { IERC20DetailedFactory } from '../../../types/IERC20DetailedFactory';
import { SturdyInternalAsset } from '../../../types/SturdyInternalAsset';
import { ILiquidator } from '../../../types/ILiquidator';

chai.use(bignumberChai());
chai.use(almostEqual());
chai.use(solidity);

export interface SignerWithAddress {
  signer: Signer;
  address: tEthereumAddress;
}
export interface TestEnv {
  deployer: SignerWithAddress;
  emergencyUser: SignerWithAddress;
  users: SignerWithAddress[];
  pool: LendingPool;
  lidoVault: LidoVault;
  yearnRETHWstETHVault: YearnRETHWstETHVault;
  convexRocketPoolETHVault: ConvexCurveLPVault;
  convexFRAX3CRVVault: ConvexCurveLPVault;
  convexMIM3CRVVault: ConvexCurveLPVault;
  convexDAIUSDCUSDTSUSDVault: ConvexCurveLPVault;
  convexSTETHVault: ConvexCurveLPVault;
  convexDOLA3CRVVault: ConvexCurveLPVault;
  convexHBTCWBTCVault: ConvexCurveLPVault;
  convexIronBankVault: ConvexCurveLPVault;
  convexFRAXUSDCVault: ConvexCurveLPVault;
  incentiveController: StakedTokenIncentivesController;
  configurator: LendingPoolConfigurator;
  oracle: PriceOracle;
  helpersContract: SturdyProtocolDataProvider;
  dai: MintableERC20;
  aDai: AToken;
  usdc: MintableERC20;
  aUsdc: AToken;
  usdt: MintableERC20;
  aUsdt: AToken;
  aave: MintableERC20;
  aStETH: AToken;
  aYVRETH_WSTETH: AToken;
  aCVXRETH_WSTETH: AToken;
  aCVXFRAX_3CRV: AToken;
  aCVXMIM_3CRV: AToken;
  aCVXDAI_USDC_USDT_SUSD: AToken;
  aCVXSTECRV: AToken;
  aCVXDOLA_3CRV: AToken;
  aCVXHBTC_WBTC: AToken;
  aCVXIRON_BANK: AToken;
  aCVXFRAX_USDC: AToken;
  brick: SturdyToken;
  lido: ILido;
  RETH_WSTETH_LP: MintableERC20;
  FRAX_3CRV_LP: MintableERC20;
  MIM_3CRV_LP: MintableERC20;
  DAI_USDC_USDT_SUSD_LP: MintableERC20;
  STECRV_LP: MintableERC20;
  DOLA_3CRV_LP: MintableERC20;
  HBTC_WBTC_LP: MintableERC20;
  IRON_BANK_LP: MintableERC20;
  FRAX_USDC_LP: MintableERC20;
  yvreth_wsteth: IERC20Detailed;
  cvxreth_wsteth: SturdyInternalAsset;
  cvxfrax_3crv: SturdyInternalAsset;
  cvxmim_3crv: SturdyInternalAsset;
  cvxdai_usdc_usdt_susd: SturdyInternalAsset;
  cvxstecrv: SturdyInternalAsset;
  cvxdola_3crv: SturdyInternalAsset;
  cvxhbtc_wbtc: SturdyInternalAsset;
  cvxiron_bank: SturdyInternalAsset;
  cvxfrax_usdc: SturdyInternalAsset;
  addressesProvider: LendingPoolAddressesProvider;
  registry: LendingPoolAddressesProviderRegistry;
  registryOwnerSigner: Signer;
  liquidator: ILiquidator;
  yieldManager: YieldManager;
  WETH: IERC20Detailed;
  CRV: IERC20Detailed;
  CVX: IERC20Detailed;
  variableYieldDistributor: VariableYieldDistribution;
  levSwapManager: LeverageSwapManager;
}

let buidlerevmSnapshotId: string = '0x1';
const setBuidlerevmSnapshotId = (id: string) => {
  buidlerevmSnapshotId = id;
};

const testEnv: TestEnv = {
  deployer: {} as SignerWithAddress,
  emergencyUser: {} as SignerWithAddress,
  users: [] as SignerWithAddress[],
  pool: {} as LendingPool,
  lidoVault: {} as LidoVault,
  yearnRETHWstETHVault: {} as YearnRETHWstETHVault,
  convexRocketPoolETHVault: {} as ConvexCurveLPVault,
  convexFRAX3CRVVault: {} as ConvexCurveLPVault,
  convexMIM3CRVVault: {} as ConvexCurveLPVault,
  convexDAIUSDCUSDTSUSDVault: {} as ConvexCurveLPVault,
  convexSTETHVault: {} as ConvexCurveLPVault,
  convexDOLA3CRVVault: {} as ConvexCurveLPVault,
  convexHBTCWBTCVault: {} as ConvexCurveLPVault,
  convexIronBankVault: {} as ConvexCurveLPVault,
  convexFRAXUSDCVault: {} as ConvexCurveLPVault,
  incentiveController: {} as StakedTokenIncentivesController,
  configurator: {} as LendingPoolConfigurator,
  helpersContract: {} as SturdyProtocolDataProvider,
  oracle: {} as PriceOracle,
  dai: {} as MintableERC20,
  aDai: {} as AToken,
  usdc: {} as MintableERC20,
  aUsdc: {} as AToken,
  usdt: {} as MintableERC20,
  aUsdt: {} as AToken,
  aave: {} as MintableERC20,
  aStETH: {} as AToken,
  aYVRETH_WSTETH: {} as AToken,
  aCVXRETH_WSTETH: {} as AToken,
  aCVXFRAX_3CRV: {} as AToken,
  aCVXMIM_3CRV: {} as AToken,
  aCVXDAI_USDC_USDT_SUSD: {} as AToken,
  aCVXSTECRV: {} as AToken,
  aCVXDOLA_3CRV: {} as AToken,
  aCVXHBTC_WBTC: {} as AToken,
  aCVXIRON_BANK: {} as AToken,
  aCVXFRAX_USDC: {} as AToken,
  brick: {} as SturdyToken,
  lido: {} as ILido,
  RETH_WSTETH_LP: {} as MintableERC20,
  FRAX_3CRV_LP: {} as MintableERC20,
  MIM_3CRV_LP: {} as MintableERC20,
  DAI_USDC_USDT_SUSD_LP: {} as MintableERC20,
  STECRV_LP: {} as MintableERC20,
  DOLA_3CRV_LP: {} as MintableERC20,
  HBTC_WBTC_LP: {} as MintableERC20,
  IRON_BANK_LP: {} as MintableERC20,
  FRAX_USDC_LP: {} as MintableERC20,
  yvreth_wsteth: {} as IERC20Detailed,
  cvxreth_wsteth: {} as SturdyInternalAsset,
  cvxfrax_3crv: {} as SturdyInternalAsset,
  cvxmim_3crv: {} as SturdyInternalAsset,
  cvxdai_usdc_usdt_susd: {} as SturdyInternalAsset,
  cvxstecrv: {} as SturdyInternalAsset,
  cvxdola_3crv: {} as SturdyInternalAsset,
  cvxhbtc_wbtc: {} as SturdyInternalAsset,
  cvxiron_bank: {} as SturdyInternalAsset,
  cvxfrax_usdc: {} as SturdyInternalAsset,
  addressesProvider: {} as LendingPoolAddressesProvider,
  registry: {} as LendingPoolAddressesProviderRegistry,
  liquidator: {} as ILiquidator,
  yieldManager: {} as YieldManager,
  WETH: {} as IERC20Detailed,
  CRV: {} as IERC20Detailed,
  CVX: {} as IERC20Detailed,
  variableYieldDistributor: {} as VariableYieldDistribution,
  levSwapManager: {} as LeverageSwapManager,
} as TestEnv;

export async function initializeMakeSuite() {
  // Mainnet missing addresses
  const poolConfig = loadPoolConfig(ConfigNames.Sturdy) as ISturdyConfiguration;
  const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>DRE.network.name;
  const lidoAddress = getParamPerNetwork(poolConfig.Lido, network);
  // const rEthWstEthLPAddress = getParamPerNetwork(poolConfig.RETH_WSTETH_LP, network);
  const Frax3CrvLPAddress = getParamPerNetwork(poolConfig.FRAX_3CRV_LP, network);
  // const SteCrvLPAddress = getParamPerNetwork(poolConfig.STECRV_LP, network);
  // const Dola3CRVLPAddress = getParamPerNetwork(poolConfig.DOLA_3CRV_LP, network);
  // const yvrethwstethAddress = getParamPerNetwork(poolConfig.YearnRETHWstETHVault, network);
  const wethAddress = getParamPerNetwork(poolConfig.WETH, network);
  const crvAddress = getParamPerNetwork(poolConfig.CRV, network);
  const cvxAddress = getParamPerNetwork(poolConfig.CVX, network);
  const Mim3CrvLPAddress = getParamPerNetwork(poolConfig.MIM_3CRV_LP, network);
  const DaiUsdcUsdtSusdLPAddress = getParamPerNetwork(poolConfig.DAI_USDC_USDT_SUSD_LP, network);
  // const HBTCWBTCLPAddress = getParamPerNetwork(poolConfig.HBTC_WBTC_LP, network);
  const IronBankLPAddress = getParamPerNetwork(poolConfig.IRON_BANK_LP, network);
  const FraxUsdcLPAddress = getParamPerNetwork(poolConfig.FRAX_USDC_LP, network);

  const [_deployer, ...restSigners] = await getEthersSigners();
  let deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  let emergencyUser: SignerWithAddress = {
    address: await restSigners[0].getAddress(),
    signer: restSigners[0],
  };

  if (network == 'goerli') {
    const deployerAddress = '0x661fB502E24Deb30e927E39A38Bd2CC44D67339F';
    const ethers = (DRE as any).ethers;
    await impersonateAccountsHardhat([deployerAddress]);
    let signer = await ethers.provider.getSigner(deployerAddress);
    deployer = {
      address: deployerAddress,
      signer: signer,
    };

    await _deployer.sendTransaction({ value: parseEther('90000'), to: deployerAddress });

    const emergencyAddress = '0x05d75FB9db95AfC448d9F79c016ab027320acEc7';
    await impersonateAccountsHardhat([emergencyAddress]);
    signer = await ethers.provider.getSigner(emergencyAddress);

    emergencyUser = {
      address: emergencyAddress,
      signer: signer,
    };

    await _deployer.sendTransaction({ value: parseEther('90000'), to: emergencyAddress });
  }

  // if (network == 'main') {
  //   const deployerAddress = '0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc';
  //   const ethers = (DRE as any).ethers;
  //   await impersonateAccountsHardhat([deployerAddress]);
  //   let signer = await ethers.provider.getSigner(deployerAddress);
  //   deployer = {
  //     address: deployerAddress,
  //     signer: signer,
  //   };

  //   await _deployer.sendTransaction({ value: parseEther('90000'), to: deployerAddress });
  // }

  for (const signer of restSigners) {
    testEnv.users.push({
      signer,
      address: await signer.getAddress(),
    });
  }
  testEnv.deployer = deployer;
  testEnv.emergencyUser = emergencyUser;
  testEnv.pool = await getLendingPool();
  testEnv.lidoVault = await getLidoVault();
  // testEnv.yearnRETHWstETHVault = await getYearnRETHWstETHVault();
  // testEnv.convexRocketPoolETHVault = await getConvexRocketPoolETHVault();
  testEnv.convexFRAX3CRVVault = await getConvexFRAX3CRVVault();
  // testEnv.convexSTETHVault = await getConvexSTETHVault();
  // testEnv.convexDOLA3CRVVault = await getConvexDOLA3CRVVault();
  testEnv.convexMIM3CRVVault = await getConvexMIM3CRVVault();
  testEnv.convexDAIUSDCUSDTSUSDVault = await getConvexDAIUSDCUSDTSUSDVault();
  // testEnv.convexHBTCWBTCVault = await getConvexHBTCWBTCVault();
  testEnv.convexIronBankVault = await getConvexIronBankVault();
  testEnv.convexFRAXUSDCVault = await getConvexFRAXUSDCVault();
  // const cvxrethwstethAddress = await testEnv.convexRocketPoolETHVault.getInternalAsset();
  const cvxfrax3crvAddress = await testEnv.convexFRAX3CRVVault.getInternalAsset();
  // const cvxstecrvAddress = await testEnv.convexSTETHVault.getInternalAsset();
  // const cvxdola3crvAddress = await testEnv.convexDOLA3CRVVault.getInternalAsset();
  const cvxmim3crvAddress = await testEnv.convexMIM3CRVVault.getInternalAsset();
  const cvxdaiusdcusdtsusdAddress = await testEnv.convexDAIUSDCUSDTSUSDVault.getInternalAsset();
  // const cvxhbtcwbtcAddress = await testEnv.convexHBTCWBTCVault.getInternalAsset();
  const cvxironbankAddress = await testEnv.convexIronBankVault.getInternalAsset();
  const cvxfraxusdcAddress = await testEnv.convexFRAXUSDCVault.getInternalAsset();
  testEnv.incentiveController = await getSturdyIncentivesController();
  // testEnv.liquidator = await getETHLiquidator();
  testEnv.yieldManager = await getYieldManager();
  testEnv.levSwapManager = await getLeverageSwapManager();
  testEnv.variableYieldDistributor = await getVariableYieldDistribution();

  testEnv.configurator = await getLendingPoolConfiguratorProxy();

  testEnv.addressesProvider = await getLendingPoolAddressesProvider();
  testEnv.oracle = await getPriceOracle(await testEnv.addressesProvider.getPriceOracle());

  if (process.env.FORK) {
    testEnv.registry = await getLendingPoolAddressesProviderRegistry(
      getParamPerNetwork(SturdyConfig.ProviderRegistry, process.env.FORK as eNetwork)
    );
    const providerRegistryOwner = getParamPerNetwork(
      poolConfig.ProviderRegistryOwner,
      process.env.FORK as eNetwork
    );
    if (!providerRegistryOwner) testEnv.registryOwnerSigner = await getFirstSigner();
    else testEnv.registryOwnerSigner = DRE.ethers.provider.getSigner(providerRegistryOwner);
  } else {
    testEnv.registry = await getLendingPoolAddressesProviderRegistry();
    // testEnv.oracle = await getPriceOracle();
  }

  testEnv.helpersContract = await getSturdyProtocolDataProvider();

  const allTokens = await testEnv.helpersContract.getAllATokens();
  const aDaiAddress = allTokens.find(
    (aToken) => aToken.symbol === 'aDAI' || aToken.symbol === 'sDAI'
  )?.tokenAddress;

  const aStETHAddress = allTokens.find(
    (aToken) => aToken.symbol === 'astETH' || aToken.symbol === 'sstETH'
  )?.tokenAddress;
  // const aYVRETH_WSTETHAddress = allTokens.find(
  //   (aToken) => aToken.symbol === 'ayvRETH_WSTETH' || aToken.symbol === 'syvRETH_WSTETH'
  // )?.tokenAddress;
  // const aCVXRETH_WSTETHAddress = allTokens.find(
  //   (aToken) => aToken.symbol === 'acvxRETH_WSTETH' || aToken.symbol === 'scvxRETH_WSTETH'
  // )?.tokenAddress;
  const aCVXFRAX_3CRVAddress = allTokens.find(
    (aToken) => aToken.symbol === 'acvxFRAX_3CRV' || aToken.symbol === 'scvxFRAX_3CRV'
  )?.tokenAddress;
  // const aCVXSTECRVAddress = allTokens.find(
  //   (aToken) => aToken.symbol === 'acvxSTECRV' || aToken.symbol === 'scvxSTECRV'
  // )?.tokenAddress;
  // const aCVXDOLA_3CRVAddress = allTokens.find(
  //   (aToken) => aToken.symbol === 'acvxDOLA_3CRV' || aToken.symbol === 'scvxDOLA_3CRV'
  // )?.tokenAddress;
  const aCVXMIM_3CRVAddress = allTokens.find(
    (aToken) => aToken.symbol === 'acvxMIM_3CRV' || aToken.symbol === 'scvxMIM_3CRV'
  )?.tokenAddress;
  const aCVXDAI_USDC_USDT_SUSDAddress = allTokens.find(
    (aToken) =>
      aToken.symbol === 'acvxDAI_USDC_USDT_SUSD' || aToken.symbol === 'scvxDAI_USDC_USDT_SUSD'
  )?.tokenAddress;
  // const aCVXHBTC_WBTCAddress = allTokens.find(
  //   (aToken) => aToken.symbol === 'acvxHBTC_WBTC' || aToken.symbol === 'scvxHBTC_WBTC'
  // )?.tokenAddress;
  const aCVXIRON_BANKAddress = allTokens.find(
    (aToken) => aToken.symbol === 'acvxIRON_BANK' || aToken.symbol === 'scvxIRON_BANK'
  )?.tokenAddress;
  const aCVXFRAX_USDCAddress = allTokens.find(
    (aToken) => aToken.symbol === 'acvxFRAX_USDC' || aToken.symbol === 'scvxFRAX_USDC'
  )?.tokenAddress;
  const aUsdcAddress = allTokens.find(
    (aToken) => aToken.symbol === 'aUSDC' || aToken.symbol === 'sUSDC'
  )?.tokenAddress;
  const aUsdtAddress = allTokens.find(
    (aToken) => aToken.symbol === 'aUSDT' || aToken.symbol === 'sUSDT'
  )?.tokenAddress;

  const reservesTokens = await testEnv.helpersContract.getAllReservesTokens();

  const daiAddress = reservesTokens.find((token) => token.symbol === 'DAI')?.tokenAddress;
  const usdcAddress = reservesTokens.find((token) => token.symbol === 'USDC')?.tokenAddress;
  const usdtAddress = reservesTokens.find((token) => token.symbol === 'USDT')?.tokenAddress;

  if (
    !aDaiAddress ||
    !aStETHAddress ||
    // !aYVRETH_WSTETHAddress ||
    // !aCVXRETH_WSTETHAddress ||
    !aCVXFRAX_3CRVAddress ||
    // !aCVXSTECRVAddress ||
    // !aCVXDOLA_3CRVAddress ||
    !aCVXMIM_3CRVAddress ||
    !aCVXDAI_USDC_USDT_SUSDAddress ||
    // !aCVXHBTC_WBTCAddress ||
    !aCVXIRON_BANKAddress ||
    !aCVXFRAX_USDCAddress
  ) {
    process.exit(1);
  }
  if (!daiAddress || !usdcAddress || !usdtAddress) {
    process.exit(1);
  }

  testEnv.aDai = await getAToken(aDaiAddress);
  testEnv.aStETH = await getAToken(aStETHAddress);
  // testEnv.aYVRETH_WSTETH = await getAToken(aYVRETH_WSTETHAddress);
  // testEnv.aCVXRETH_WSTETH = await getAToken(aCVXRETH_WSTETHAddress);
  testEnv.aCVXFRAX_3CRV = await getAToken(aCVXFRAX_3CRVAddress);
  // testEnv.aCVXSTECRV = await getAToken(aCVXSTECRVAddress);
  // testEnv.aCVXDOLA_3CRV = await getAToken(aCVXDOLA_3CRVAddress);
  testEnv.aCVXMIM_3CRV = await getAToken(aCVXMIM_3CRVAddress);
  testEnv.aCVXDAI_USDC_USDT_SUSD = await getAToken(aCVXDAI_USDC_USDT_SUSDAddress);
  // testEnv.aCVXHBTC_WBTC = await getAToken(aCVXHBTC_WBTCAddress);
  testEnv.aCVXIRON_BANK = await getAToken(aCVXIRON_BANKAddress);
  testEnv.aCVXFRAX_USDC = await getAToken(aCVXFRAX_USDCAddress);
  testEnv.aUsdc = await getAToken(aUsdcAddress);
  testEnv.aUsdt = await getAToken(aUsdtAddress);

  testEnv.dai = await getMintableERC20(daiAddress);
  testEnv.usdc = await getMintableERC20(usdcAddress);
  testEnv.usdt = await getMintableERC20(usdtAddress);
  testEnv.brick = await getSturdyToken();
  testEnv.lido = ILidoFactory.connect(lidoAddress, deployer.signer);
  // testEnv.RETH_WSTETH_LP = await getMintableERC20(rEthWstEthLPAddress);
  testEnv.FRAX_3CRV_LP = await getMintableERC20(Frax3CrvLPAddress);
  // testEnv.STECRV_LP = await getMintableERC20(SteCrvLPAddress);
  // testEnv.DOLA_3CRV_LP = await getMintableERC20(Dola3CRVLPAddress);
  testEnv.MIM_3CRV_LP = await getMintableERC20(Mim3CrvLPAddress);
  testEnv.DAI_USDC_USDT_SUSD_LP = await getMintableERC20(DaiUsdcUsdtSusdLPAddress);
  // testEnv.HBTC_WBTC_LP = await getMintableERC20(HBTCWBTCLPAddress);
  testEnv.IRON_BANK_LP = await getMintableERC20(IronBankLPAddress);
  testEnv.FRAX_USDC_LP = await getMintableERC20(FraxUsdcLPAddress);
  testEnv.WETH = IERC20DetailedFactory.connect(wethAddress, deployer.signer);
  testEnv.CRV = IERC20DetailedFactory.connect(crvAddress, deployer.signer);
  testEnv.CVX = IERC20DetailedFactory.connect(cvxAddress, deployer.signer);
  // testEnv.yvreth_wsteth = IERC20DetailedFactory.connect(yvrethwstethAddress, deployer.signer);
  // testEnv.cvxreth_wsteth = SturdyInternalAssetFactory.connect(
  //   cvxrethwstethAddress,
  //   deployer.signer
  // );
  testEnv.cvxfrax_3crv = SturdyInternalAssetFactory.connect(cvxfrax3crvAddress, deployer.signer);
  // testEnv.cvxstecrv = SturdyInternalAssetFactory.connect(cvxstecrvAddress, deployer.signer);
  // testEnv.cvxdola_3crv = SturdyInternalAssetFactory.connect(cvxdola3crvAddress, deployer.signer);
  testEnv.cvxmim_3crv = SturdyInternalAssetFactory.connect(cvxmim3crvAddress, deployer.signer);
  testEnv.cvxdai_usdc_usdt_susd = SturdyInternalAssetFactory.connect(
    cvxdaiusdcusdtsusdAddress,
    deployer.signer
  );
  // testEnv.cvxhbtc_wbtc = SturdyInternalAssetFactory.connect(cvxhbtcwbtcAddress, deployer.signer);
  testEnv.cvxiron_bank = SturdyInternalAssetFactory.connect(cvxironbankAddress, deployer.signer);
  testEnv.cvxfrax_usdc = SturdyInternalAssetFactory.connect(cvxfraxusdcAddress, deployer.signer);
}

const setSnapshot = async () => {
  const hre = DRE as HardhatRuntimeEnvironment;
  if (usingTenderly()) {
    setBuidlerevmSnapshotId((await hre.tenderlyNetwork.getHead()) || '0x1');
    return;
  }
  setBuidlerevmSnapshotId(await evmSnapshot());
};

const revertHead = async () => {
  const hre = DRE as HardhatRuntimeEnvironment;
  if (usingTenderly()) {
    await hre.tenderlyNetwork.setHead(buidlerevmSnapshotId);
    return;
  }
  await evmRevert(buidlerevmSnapshotId);
};

export function makeSuite(name: string, tests: (testEnv: TestEnv) => void) {
  describe(name, () => {
    before(async () => {
      if (DRE.network.name != 'goerli') await setSnapshot();
    });
    tests(testEnv);
    after(async () => {
      if (DRE.network.name != 'goerli') await revertHead();
    });
  });
}
