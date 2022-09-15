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
  getPriceOracle,
  getLendingPoolAddressesProviderRegistry,
  getSturdyIncentivesController,
  getFirstSigner,
  getYieldManager,
  getVariableYieldDistribution,
  getMintableERC20,
  getConvexETHSTETHVault,
} from '../../../helpers/contracts-getters';
import { eNetwork, IEthConfiguration, tEthereumAddress } from '../../../helpers/types';
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
import {
  StakedTokenIncentivesController,
  YieldManager,
  VariableYieldDistribution,
  ConvexCurveLPVault,
  SturdyInternalAsset,
  LeverageSwapManager,
  SturdyAPRDataProvider,
  SturdyInternalAssetFactory,
} from '../../../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { usingTenderly } from '../../../helpers/tenderly-utils';
import { ConfigNames, loadPoolConfig } from '../../../helpers/configuration';
import { parseEther } from '@ethersproject/units';
import { ILiquidator } from '../../../types/ILiquidator';
import EthConfig from '../../../markets/eth';
import { IERC20Detailed } from '../../../types/IERC20Detailed';

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
  convexETHSTETHVault: ConvexCurveLPVault;
  incentiveController: StakedTokenIncentivesController;
  configurator: LendingPoolConfigurator;
  oracle: PriceOracle;
  helpersContract: SturdyProtocolDataProvider;
  weth: MintableERC20;
  aWeth: AToken;
  aCVXETH_STETH: AToken;
  ETH_STETH_LP: MintableERC20;
  cvxeth_steth: SturdyInternalAsset;
  addressesProvider: LendingPoolAddressesProvider;
  registry: LendingPoolAddressesProviderRegistry;
  registryOwnerSigner: Signer;
  liquidator: ILiquidator;
  yieldManager: YieldManager;
  variableYieldDistributor: VariableYieldDistribution;
  CRV: IERC20Detailed;
  CVX: IERC20Detailed;
  levSwapManager: LeverageSwapManager;
  aprProvider: SturdyAPRDataProvider;
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
  convexETHSTETHVault: {} as ConvexCurveLPVault,
  incentiveController: {} as StakedTokenIncentivesController,
  configurator: {} as LendingPoolConfigurator,
  helpersContract: {} as SturdyProtocolDataProvider,
  oracle: {} as PriceOracle,
  weth: {} as MintableERC20,
  aWeth: {} as AToken,
  aCVXETH_STETH: {} as AToken,
  ETH_STETH_LP: {} as MintableERC20,
  cvxeth_steth: {} as SturdyInternalAsset,
  addressesProvider: {} as LendingPoolAddressesProvider,
  registry: {} as LendingPoolAddressesProviderRegistry,
  liquidator: {} as ILiquidator,
  yieldManager: {} as YieldManager,
  variableYieldDistributor: {} as VariableYieldDistribution,
  CRV: {} as IERC20Detailed,
  CVX: {} as IERC20Detailed,
  levSwapManager: {} as LeverageSwapManager,
  aprProvider: {} as SturdyAPRDataProvider,
} as TestEnv;

export async function initializeMakeSuite() {
  // Mainnet missing addresses
  const poolConfig = loadPoolConfig(ConfigNames.Eth) as IEthConfiguration;
  const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>DRE.network.name;
  const EthStEthLPAddress = getParamPerNetwork(poolConfig.ETH_STETH_LP, network);

  const [_deployer, ...restSigners] = await getEthersSigners();
  let deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  let emergencyUser: SignerWithAddress = {
    address: await restSigners[0].getAddress(),
    signer: restSigners[0],
  };

  if (network == 'main') {
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
  
  testEnv.incentiveController = await getSturdyIncentivesController();
  // testEnv.liquidator = await getETHLiquidator();

  const cvxethstethAddress = await testEnv.convexETHSTETHVault.getInternalAsset();

  testEnv.yieldManager = await getYieldManager();
  
  testEnv.variableYieldDistributor = await getVariableYieldDistribution();

  testEnv.configurator = await getLendingPoolConfiguratorProxy();

  testEnv.addressesProvider = await getLendingPoolAddressesProvider();
  testEnv.oracle = await getPriceOracle(await testEnv.addressesProvider.getPriceOracle());

  if (process.env.FORK) {
    testEnv.registry = await getLendingPoolAddressesProviderRegistry(
      getParamPerNetwork(EthConfig.ProviderRegistry, process.env.FORK as eNetwork)
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
  const aWethAddress = allTokens.find(
    (aToken) => aToken.symbol === 'sWETH'
  )?.tokenAddress;
  const aCVXETH_STETHAddress = allTokens.find(
    (aToken) => aToken.symbol === 'scvxETH_STETH'
  )?.tokenAddress;

  const reservesTokens = await testEnv.helpersContract.getAllReservesTokens();

  const wethAddress = reservesTokens.find((token) => token.symbol === 'WETH')?.tokenAddress;

  if (
    !aWethAddress ||
    !aCVXETH_STETHAddress
  ) {
    process.exit(1);
  }
  if (!wethAddress) {
    process.exit(1);
  }

  testEnv.aWeth = await getAToken(aWethAddress);
  testEnv.aCVXETH_STETH = await getAToken(aCVXETH_STETHAddress);

  testEnv.weth = await getMintableERC20(wethAddress);
  testEnv.ETH_STETH_LP = await getMintableERC20(EthStEthLPAddress);

  testEnv.cvxeth_steth = SturdyInternalAssetFactory.connect(cvxethstethAddress, deployer.signer);
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
