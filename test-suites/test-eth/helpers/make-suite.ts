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
  getLendingPoolConfiguratorProxy,
  getLendingPoolAddressesProviderRegistry,
  getSturdyIncentivesController,
  getFirstSigner,
  getYieldManager,
  getVariableYieldDistribution,
  getMintableERC20,
  getConvexETHSTETHVault,
  getSturdyAPRDataProvider,
  getLeverageSwapManager,
  getAuraWSTETHWETHVault,
  getSturdyOracle,
  getWETHGateway,
  getAuraRETHWETHVault,
  getStaticAToken,
} from '../../../helpers/contracts-getters';
import { eNetwork, IEthConfiguration, tEthereumAddress } from '../../../helpers/types';
import { LendingPool, StaticAToken, WETHGateway } from '../../../types';
import { SturdyProtocolDataProvider } from '../../../types';
import { MintableERC20 } from '../../../types';
import { AToken } from '../../../types';
import { LendingPoolConfigurator } from '../../../types';

import chai from 'chai';
// @ts-ignore
import bignumberChai from 'chai-bignumber';
import { almostEqual } from './almost-equal';
import { LendingPoolAddressesProvider } from '../../../types';
import { LendingPoolAddressesProviderRegistry } from '../../../types';
import { getEthersSigners } from '../../../helpers/contracts-helpers';
import { getParamPerNetwork } from '../../../helpers/contracts-helpers';
import { solidity } from 'ethereum-waffle';
import {
  StakedTokenIncentivesController,
  YieldManager,
  VariableYieldDistribution,
  SturdyInternalAsset,
  LeverageSwapManager,
  SturdyAPRDataProvider,
  SturdyInternalAsset__factory,
  AuraBalancerLPVault,
  ConvexCurveLPVault2,
  SturdyOracle,
} from '../../../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { usingTenderly } from '../../../helpers/tenderly-utils';
import { ConfigNames, loadPoolConfig } from '../../../helpers/configuration';
import { parseEther } from '@ethersproject/units';
import EthConfig from '../../../markets/eth';
import { IERC20Detailed } from '../../../types';
import { IERC20Detailed__factory } from '../../../types';

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
  convexETHSTETHVault: ConvexCurveLPVault2;
  auraWSTETHWETHVault: AuraBalancerLPVault;
  auraRETHWETHVault: AuraBalancerLPVault;
  incentiveController: StakedTokenIncentivesController;
  configurator: LendingPoolConfigurator;
  oracle: SturdyOracle;
  helpersContract: SturdyProtocolDataProvider;
  weth: MintableERC20;
  aWeth: AToken;
  // staticAWeth: StaticAToken;
  aCVXETH_STETH: AToken;
  aAURAWSTETH_WETH: AToken;
  aAURARETH_WETH: AToken;
  ETH_STETH_LP: MintableERC20;
  BAL_WSTETH_WETH_LP: MintableERC20;
  BAL_RETH_WETH_LP: MintableERC20;
  cvxeth_steth: SturdyInternalAsset;
  aurawsteth_weth: SturdyInternalAsset;
  aurareth_weth: SturdyInternalAsset;
  addressesProvider: LendingPoolAddressesProvider;
  registry: LendingPoolAddressesProviderRegistry;
  registryOwnerSigner: Signer;
  yieldManager: YieldManager;
  variableYieldDistributor: VariableYieldDistribution;
  CRV: IERC20Detailed;
  CVX: IERC20Detailed;
  LDO: IERC20Detailed;
  BAL: IERC20Detailed;
  AURA: IERC20Detailed;
  levSwapManager: LeverageSwapManager;
  aprProvider: SturdyAPRDataProvider;
  wethGateway: WETHGateway;
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
  convexETHSTETHVault: {} as ConvexCurveLPVault2,
  auraWSTETHWETHVault: {} as AuraBalancerLPVault,
  auraRETHWETHVault: {} as AuraBalancerLPVault,
  incentiveController: {} as StakedTokenIncentivesController,
  configurator: {} as LendingPoolConfigurator,
  helpersContract: {} as SturdyProtocolDataProvider,
  oracle: {} as SturdyOracle,
  weth: {} as MintableERC20,
  aWeth: {} as AToken,
  // staticAWeth: {} as StaticAToken,
  aCVXETH_STETH: {} as AToken,
  aAURAWSTETH_WETH: {} as AToken,
  aAURARETH_WETH: {} as AToken,
  ETH_STETH_LP: {} as MintableERC20,
  BAL_WSTETH_WETH_LP: {} as MintableERC20,
  BAL_RETH_WETH_LP: {} as MintableERC20,
  cvxeth_steth: {} as SturdyInternalAsset,
  aurawsteth_weth: {} as SturdyInternalAsset,
  aurareth_weth: {} as SturdyInternalAsset,
  addressesProvider: {} as LendingPoolAddressesProvider,
  registry: {} as LendingPoolAddressesProviderRegistry,
  yieldManager: {} as YieldManager,
  variableYieldDistributor: {} as VariableYieldDistribution,
  CRV: {} as IERC20Detailed,
  CVX: {} as IERC20Detailed,
  LDO: {} as IERC20Detailed,
  BAL: {} as IERC20Detailed,
  AURA: {} as IERC20Detailed,
  levSwapManager: {} as LeverageSwapManager,
  aprProvider: {} as SturdyAPRDataProvider,
  wethGateway: {} as WETHGateway,
} as TestEnv;

export async function initializeMakeSuite() {
  // Mainnet missing addresses
  const ethers = (DRE as any).ethers;
  const poolConfig = loadPoolConfig(ConfigNames.Eth) as IEthConfiguration;
  const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>DRE.network.name;
  const EthStEthLPAddress = getParamPerNetwork(poolConfig.ETH_STETH_LP, network);
  const BalWstethWethLPAddress = getParamPerNetwork(poolConfig.BAL_WSTETH_WETH_LP, network);
  const BalRethWethLPAddress = getParamPerNetwork(poolConfig.BAL_RETH_WETH_LP, network);
  const crvAddress = getParamPerNetwork(poolConfig.CRV, network);
  const cvxAddress = getParamPerNetwork(poolConfig.CVX, network);
  const ldoAddress = getParamPerNetwork(poolConfig.LDO, network);
  const balAddress = getParamPerNetwork(poolConfig.BAL, network);
  const auraAddress = getParamPerNetwork(poolConfig.AURA, network);

  const [_deployer, ...restSigners] = await getEthersSigners();
  let deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  let emergencyUser: SignerWithAddress = {
    address: await restSigners[0].getAddress(),
    signer: restSigners[0],
  };

  if (network == 'main' && !process.env.FORK) {
    const deployerAddress = '0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc';
    const ethers = (DRE as any).ethers;
    await impersonateAccountsHardhat([deployerAddress]);
    let signer = await ethers.provider.getSigner(deployerAddress);
    deployer = {
      address: deployerAddress,
      signer: signer,
    };

    await _deployer.sendTransaction({ value: parseEther('90000'), to: deployerAddress });
  }

  for (const signer of restSigners) {
    testEnv.users.push({
      signer,
      address: await signer.getAddress(),
    });
  }
  testEnv.deployer = deployer;
  testEnv.emergencyUser = emergencyUser;
  testEnv.pool = await getLendingPool();

  testEnv.convexETHSTETHVault = await getConvexETHSTETHVault();
  testEnv.auraWSTETHWETHVault = await getAuraWSTETHWETHVault();
  testEnv.auraRETHWETHVault = await getAuraRETHWETHVault();
  
  testEnv.incentiveController = await getSturdyIncentivesController();
  // testEnv.liquidator = await getETHLiquidator();

  const cvxethstethAddress = await testEnv.convexETHSTETHVault.getInternalAsset();
  const aurawstethwethAddress = await testEnv.auraWSTETHWETHVault.getInternalAsset();
  const aurarethwethAddress = await testEnv.auraRETHWETHVault.getInternalAsset();

  testEnv.yieldManager = await getYieldManager();
  testEnv.levSwapManager = await getLeverageSwapManager();
  testEnv.variableYieldDistributor = await getVariableYieldDistribution();
  testEnv.configurator = await getLendingPoolConfiguratorProxy();
  testEnv.addressesProvider = await getLendingPoolAddressesProvider();
  testEnv.oracle = await getSturdyOracle(await testEnv.addressesProvider.getPriceOracle());
  testEnv.aprProvider = await getSturdyAPRDataProvider();

  if (process.env.FORK) {
    testEnv.registry = await getLendingPoolAddressesProviderRegistry(
      getParamPerNetwork(EthConfig.ProviderRegistry, process.env.FORK as eNetwork)
    );
    const providerRegistryOwner = getParamPerNetwork(
      poolConfig.ProviderRegistryOwner,
      process.env.FORK as eNetwork
    );
    if (!providerRegistryOwner) testEnv.registryOwnerSigner = await getFirstSigner();
    else testEnv.registryOwnerSigner = ethers.provider.getSigner(providerRegistryOwner);
  } else {
    testEnv.registry = await getLendingPoolAddressesProviderRegistry();
    // testEnv.oracle = await getPriceOracle();
  }

  testEnv.helpersContract = await getSturdyProtocolDataProvider();

  const allTokens = await testEnv.helpersContract.getAllATokens();
  const aWethAddress = allTokens.find(
    (aToken) => aToken.symbol === 'sWETH'
  )?.tokenAddress;
  const aCVXETH_STETHAddress = allTokens.find(
    (aToken) => aToken.symbol === 'scvxETH_STETH'
  )?.tokenAddress;
  const aAURAWSTETH_WETHAddress = allTokens.find(
    (aToken) => aToken.symbol === 'sauraWSTETH_WETH'
  )?.tokenAddress;
  const aAURARETH_WETHAddress = allTokens.find(
    (aToken) => aToken.symbol === 'sauraRETH_WETH'
  )?.tokenAddress;

  const reservesTokens = await testEnv.helpersContract.getAllReservesTokens();

  const wethAddress = reservesTokens.find((token) => token.symbol === 'WETH')?.tokenAddress;

  if (
    !aWethAddress ||
    !aCVXETH_STETHAddress ||
    !aAURAWSTETH_WETHAddress ||
    !aAURARETH_WETHAddress
  ) {
    process.exit(1);
  }
  if (!wethAddress) {
    process.exit(1);
  }

  testEnv.aWeth = await getAToken(aWethAddress);
  // testEnv.staticAWeth = await getStaticAToken('sWETH');
  testEnv.aCVXETH_STETH = await getAToken(aCVXETH_STETHAddress);
  testEnv.aAURAWSTETH_WETH = await getAToken(aAURAWSTETH_WETHAddress);
  testEnv.aAURARETH_WETH = await getAToken(aAURARETH_WETHAddress);

  testEnv.weth = await getMintableERC20(wethAddress);
  testEnv.wethGateway = await getWETHGateway();
  testEnv.ETH_STETH_LP = await getMintableERC20(EthStEthLPAddress);
  testEnv.BAL_WSTETH_WETH_LP = await getMintableERC20(BalWstethWethLPAddress);
  testEnv.BAL_RETH_WETH_LP = await getMintableERC20(BalRethWethLPAddress);

  testEnv.CRV = IERC20Detailed__factory.connect(crvAddress, deployer.signer);
  testEnv.CVX = IERC20Detailed__factory.connect(cvxAddress, deployer.signer);
  testEnv.LDO = IERC20Detailed__factory.connect(ldoAddress, deployer.signer);
  testEnv.BAL = IERC20Detailed__factory.connect(balAddress, deployer.signer);
  testEnv.AURA = IERC20Detailed__factory.connect(auraAddress, deployer.signer);
  testEnv.cvxeth_steth = SturdyInternalAsset__factory.connect(cvxethstethAddress, deployer.signer);
  testEnv.aurawsteth_weth = SturdyInternalAsset__factory.connect(aurawstethwethAddress, deployer.signer);
  testEnv.aurareth_weth = SturdyInternalAsset__factory.connect(aurarethwethAddress, deployer.signer);
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
