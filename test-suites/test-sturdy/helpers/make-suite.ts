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
} from '../../../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { usingTenderly } from '../../../helpers/tenderly-utils';
import { ILido } from '../../../types/ILido';
import { ILidoFactory } from '../../../types/ILidoFactory';
import { ConfigNames, loadPoolConfig } from '../../../helpers/configuration';
import { parseEther } from '@ethersproject/units';
import { IERC20Detailed } from '../../../types/IERC20Detailed';
import { IERC20DetailedFactory } from '../../../types/IERC20DetailedFactory';

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
  incentiveController: StakedTokenIncentivesController;
  configurator: LendingPoolConfigurator;
  oracle: PriceOracle;
  helpersContract: SturdyProtocolDataProvider;
  dai: MintableERC20;
  aDai: AToken;
  usdc: MintableERC20;
  aUsdc: AToken;
  aave: MintableERC20;
  aStETH: AToken;
  aYVRETH_WSTETH: AToken;
  brick: SturdyToken;
  lido: ILido;
  RETH_WSTETH_LP: MintableERC20;
  yvreth_wsteth: IERC20Detailed;
  addressesProvider: LendingPoolAddressesProvider;
  registry: LendingPoolAddressesProviderRegistry;
  registryOwnerSigner: Signer;
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
  incentiveController: {} as StakedTokenIncentivesController,
  configurator: {} as LendingPoolConfigurator,
  helpersContract: {} as SturdyProtocolDataProvider,
  oracle: {} as PriceOracle,
  dai: {} as MintableERC20,
  aDai: {} as AToken,
  usdc: {} as MintableERC20,
  aUsdc: {} as AToken,
  aave: {} as MintableERC20,
  aStETH: {} as AToken,
  aYVRETH_WSTETH: {} as AToken,
  brick: {} as SturdyToken,
  lido: {} as ILido,
  RETH_WSTETH_LP: {} as MintableERC20,
  yvreth_wsteth: {} as IERC20Detailed,
  addressesProvider: {} as LendingPoolAddressesProvider,
  registry: {} as LendingPoolAddressesProviderRegistry,
} as TestEnv;

export async function initializeMakeSuite() {
  // Mainnet missing addresses
  const poolConfig = loadPoolConfig(ConfigNames.Sturdy) as ISturdyConfiguration;
  const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>DRE.network.name;
  const lidoAddress = getParamPerNetwork(poolConfig.Lido, network);
  const rEthWstEthLPAddress = getParamPerNetwork(poolConfig.RETH_WSTETH_LP, network);
  const yvrethwstethAddress = getParamPerNetwork(poolConfig.YearnRETHWstETHVault, network);

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
  testEnv.yearnRETHWstETHVault = await getYearnRETHWstETHVault();
  testEnv.incentiveController = await getSturdyIncentivesController();

  testEnv.configurator = await getLendingPoolConfiguratorProxy();

  testEnv.addressesProvider = await getLendingPoolAddressesProvider();

  if (process.env.FORK) {
    testEnv.registry = await getLendingPoolAddressesProviderRegistry(
      getParamPerNetwork(SturdyConfig.ProviderRegistry, process.env.FORK as eNetwork)
    );
    testEnv.oracle = await getPriceOracle(await testEnv.addressesProvider.getPriceOracle());

    const providerRegistryOwner = getParamPerNetwork(
      poolConfig.ProviderRegistryOwner,
      process.env.FORK as eNetwork
    );
    if (!providerRegistryOwner) testEnv.registryOwnerSigner = await getFirstSigner();
    else testEnv.registryOwnerSigner = DRE.ethers.provider.getSigner(providerRegistryOwner);
  } else {
    testEnv.registry = await getLendingPoolAddressesProviderRegistry();
    testEnv.oracle = await getPriceOracle();
  }

  testEnv.helpersContract = await getSturdyProtocolDataProvider();

  const allTokens = await testEnv.helpersContract.getAllATokens();
  const aDaiAddress = allTokens.find(
    (aToken) => aToken.symbol === 'aDAI' || aToken.symbol === 'sDAI'
  )?.tokenAddress;

  const aStETHAddress = allTokens.find(
    (aToken) => aToken.symbol === 'astETH' || aToken.symbol === 'sstETH'
  )?.tokenAddress;
  const aYVRETH_WSTETHAddress = allTokens.find(
    (aToken) => aToken.symbol === 'ayvRETH_WSTETH' || aToken.symbol === 'syvRETH_WSTETH'
  )?.tokenAddress;
  const aUsdcAddress = allTokens.find(
    (aToken) => aToken.symbol === 'aUSDC' || aToken.symbol === 'sUSDC'
  )?.tokenAddress;

  const reservesTokens = await testEnv.helpersContract.getAllReservesTokens();

  const daiAddress = reservesTokens.find((token) => token.symbol === 'DAI')?.tokenAddress;
  const usdcAddress = reservesTokens.find((token) => token.symbol === 'USDC')?.tokenAddress;

  if (!aDaiAddress || !aStETHAddress || !aYVRETH_WSTETHAddress) {
    process.exit(1);
  }
  if (!daiAddress || !usdcAddress) {
    process.exit(1);
  }

  testEnv.aDai = await getAToken(aDaiAddress);
  testEnv.aStETH = await getAToken(aStETHAddress);
  testEnv.aYVRETH_WSTETH = await getAToken(aYVRETH_WSTETHAddress);
  testEnv.aUsdc = await getAToken(aUsdcAddress);

  testEnv.dai = await getMintableERC20(daiAddress);
  testEnv.usdc = await getMintableERC20(usdcAddress);
  testEnv.brick = await getSturdyToken();
  testEnv.lido = ILidoFactory.connect(lidoAddress, deployer.signer);
  testEnv.RETH_WSTETH_LP = await getMintableERC20(rEthWstEthLPAddress);
  testEnv.yvreth_wsteth = IERC20DetailedFactory.connect(yvrethwstethAddress, deployer.signer);
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
