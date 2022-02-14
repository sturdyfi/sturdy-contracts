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
  getSturdyIncentivesController,
  getSturdyToken,
  getFirstSigner,
  getYearnVault,
  // getBeefyVault,
  getSwapinERC20,
  getYearnWETHVault,
  getYearnWBTCVault,
} from '../../../helpers/contracts-getters';
import { eNetwork, IFantomConfiguration, tEthereumAddress } from '../../../helpers/types';
import { LendingPool } from '../../../types/LendingPool';
import { SturdyProtocolDataProvider } from '../../../types/SturdyProtocolDataProvider';
import { MintableERC20 } from '../../../types/MintableERC20';
import { SwapinERC20 } from '../../../types/SwapinERC20';
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
  StakedTokenIncentivesController,
  SturdyToken,
  YearnVault,
  BeefyVault,
  YearnWETHVault,
  YearnWBTCVault,
} from '../../../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { usingTenderly } from '../../../helpers/tenderly-utils';
import { ConfigNames, loadPoolConfig } from '../../../helpers/configuration';
import { IERC20Detailed } from '../../../types/IERC20Detailed';
import { IERC20DetailedFactory } from '../../../types/IERC20DetailedFactory';
import { parseEther } from '@ethersproject/units';

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
  yearnVault: YearnVault;
  // beefyVault: BeefyVault;
  yearnWETHVault: YearnWETHVault;
  yearnWBTCVault: YearnWBTCVault;
  incentiveController: StakedTokenIncentivesController;
  configurator: LendingPoolConfigurator;
  oracle: PriceOracle;
  helpersContract: SturdyProtocolDataProvider;
  dai: MintableERC20;
  aDai: AToken;
  usdt: MintableERC20;
  usdc: SwapinERC20;
  aUsdc: AToken;
  aUsdt: AToken;
  aYVWFTM: AToken;
  aYVWETH: AToken;
  aYVWBTC: AToken;
  // aMOOWETH: AToken;
  WFTM: MintableERC20;
  WETH: SwapinERC20;
  WBTC: SwapinERC20;
  brick: SturdyToken;
  yvwftm: IERC20Detailed;
  yvweth: IERC20Detailed;
  yvwbtc: IERC20Detailed;
  // mooweth: IERC20Detailed;
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
  yearnVault: {} as YearnVault,
  // beefyVault: {} as BeefyVault,
  yearnWETHVault: {} as YearnWETHVault,
  yearnWBTCVault: {} as YearnWBTCVault,
  incentiveController: {} as StakedTokenIncentivesController,
  configurator: {} as LendingPoolConfigurator,
  helpersContract: {} as SturdyProtocolDataProvider,
  oracle: {} as PriceOracle,
  dai: {} as MintableERC20,
  aDai: {} as AToken,
  usdc: {} as SwapinERC20,
  usdt: {} as MintableERC20,
  aUsdc: {} as AToken,
  aUsdt: {} as AToken,
  aYVWFTM: {} as AToken,
  aYVWETH: {} as AToken,
  aYVWBTC: {} as AToken,
  // aMOOWETH: {} as AToken,
  WFTM: {} as MintableERC20,
  WETH: {} as SwapinERC20,
  WBTC: {} as SwapinERC20,
  brick: {} as SturdyToken,
  yvwftm: {} as IERC20Detailed,
  yvweth: {} as IERC20Detailed,
  yvwbtc: {} as IERC20Detailed,
  // mooweth: {} as IERC20Detailed,
  addressesProvider: {} as LendingPoolAddressesProvider,
  registry: {} as LendingPoolAddressesProviderRegistry,
} as TestEnv;

export async function initializeMakeSuite() {
  // Mainnet missing addresses
  const poolConfig = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>DRE.network.name;
  const yvwftmAddress = getParamPerNetwork(poolConfig.YearnVaultFTM, network);
  // const moowethAddress = getParamPerNetwork(poolConfig.BeefyVaultFTM, network);
  const yvwethAddress = getParamPerNetwork(poolConfig.YearnWETHVaultFTM, network);
  const yvwbtcAddress = getParamPerNetwork(poolConfig.YearnWBTCVaultFTM, network);
  const wftmAddress = getParamPerNetwork(poolConfig.WFTM, network);
  const wethAddress = getParamPerNetwork(poolConfig.WETH, network);
  const wbtcAddress = getParamPerNetwork(poolConfig.WBTC, network);

  const [_deployer, ...restSigners] = await getEthersSigners();
  let deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  let emergencyUser: SignerWithAddress = {
    address: await restSigners[0].getAddress(),
    signer: restSigners[0],
  };

  if (network == 'ftm_test') {
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
  } else if (network == 'ftm') {
    const deployerAddress = '0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc';
    const ethers = (DRE as any).ethers;
    await impersonateAccountsHardhat([deployerAddress]);
    let signer = await ethers.provider.getSigner(deployerAddress);
    deployer = {
      address: deployerAddress,
      signer: signer,
    };

    await _deployer.sendTransaction({ value: parseEther('90000'), to: deployerAddress });

    const emergencyAddress = '0xc4bb97d8c974221faed7b023736b990cA3EF1C5d';
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
  testEnv.yearnVault = await getYearnVault();
  // testEnv.beefyVault = await getBeefyVault();
  testEnv.yearnWETHVault = await getYearnWETHVault();
  testEnv.yearnWBTCVault = await getYearnWBTCVault();
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
  const aDaiAddress = allTokens.find((aToken) => aToken.symbol === 'aDAI' || aToken.symbol === 'sDAI')?.tokenAddress;

  const aYVWFTMAddress = allTokens.find((aToken) => aToken.symbol === 'ayvWFTM' || aToken.symbol === 'syvWFTM')?.tokenAddress;
  const aYVWETHAddress = allTokens.find((aToken) => aToken.symbol === 'ayvWETH' || aToken.symbol === 'syvWETH')?.tokenAddress;
  let aYVWBTCAddress;   // tempcode for fantom testnet, because it has same name ayvWBTC token.
  if (allTokens.filter((aToken) => aToken.symbol === 'ayvWBTC' || aToken.symbol === 'syvWBTC').length > 1)
    aYVWBTCAddress = allTokens.filter((aToken) => aToken.symbol === 'ayvWBTC' || aToken.symbol === 'syvWBTC')[1].tokenAddress;
  else
    aYVWBTCAddress = allTokens.find((aToken) => aToken.symbol === 'ayvWBTC' || aToken.symbol === 'syvWBTC')?.tokenAddress;
  
  // const aMOOWETHAddress = allTokens.find((aToken) => aToken.symbol === 'amooWETH')?.tokenAddress;
  const aUsdcAddress = allTokens.find((aToken) => aToken.symbol === 'aUSDC' || aToken.symbol === 'sUSDC')?.tokenAddress;
  const aUsdtAddress = allTokens.find((aToken) => aToken.symbol === (network == 'ftm_test' ? 'aUSDT' : 'afUSDT') || aToken.symbol === (network == 'ftm_test' ? 'sUSDT' : 'sfUSDT'))?.tokenAddress;

  const reservesTokens = await testEnv.helpersContract.getAllReservesTokens();

  const daiAddress = reservesTokens.find((token) => token.symbol === 'DAI')?.tokenAddress;
  const usdcAddress = reservesTokens.find((token) => token.symbol === 'USDC')?.tokenAddress;
  const usdtAddress = reservesTokens.find((token) => token.symbol ===  (network == 'ftm_test' ? 'USDT' : 'fUSDT'))?.tokenAddress;

  if (!aDaiAddress || !aUsdcAddress || !aUsdtAddress || !aYVWFTMAddress || !aYVWETHAddress || !aYVWBTCAddress) {
    process.exit(1);
  }
  if (!daiAddress || !usdcAddress || !usdtAddress) {
    process.exit(1);
  }

  testEnv.aDai = await getAToken(aDaiAddress);
  testEnv.aYVWFTM = await getAToken(aYVWFTMAddress);
  testEnv.aYVWETH = await getAToken(aYVWETHAddress);
  testEnv.aYVWBTC = await getAToken(aYVWBTCAddress);
  // testEnv.aMOOWETH = await getAToken(aMOOWETHAddress);
  testEnv.aUsdc = await getAToken(aUsdcAddress);
  testEnv.aUsdt = await getAToken(aUsdtAddress);

  testEnv.dai = await getMintableERC20(daiAddress);
  testEnv.usdc = await getSwapinERC20(usdcAddress);
  testEnv.usdt = await getMintableERC20(usdtAddress);
  testEnv.WFTM = await getMintableERC20(wftmAddress);
  testEnv.WETH = await getSwapinERC20(wethAddress);
  testEnv.WBTC = await getSwapinERC20(wbtcAddress);
  testEnv.brick = await getSturdyToken();
  testEnv.yvwftm = IERC20DetailedFactory.connect(yvwftmAddress, deployer.signer);
  testEnv.yvweth = IERC20DetailedFactory.connect(yvwethAddress, deployer.signer);
  testEnv.yvwbtc = IERC20DetailedFactory.connect(yvwbtcAddress, deployer.signer);
  // testEnv.mooweth = IERC20DetailedFactory.connect(moowethAddress, deployer.signer);
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
