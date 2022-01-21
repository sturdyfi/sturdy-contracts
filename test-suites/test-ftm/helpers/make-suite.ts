import { evmRevert, evmSnapshot, DRE } from '../../../helpers/misc-utils';
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
  getBeefyVault,
  getSwapinERC20,
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
} from '../../../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { usingTenderly } from '../../../helpers/tenderly-utils';
import { ConfigNames, loadPoolConfig } from '../../../helpers/configuration';
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
  yearnVault: YearnVault;
  beefyVault: BeefyVault;
  incentiveController: StakedTokenIncentivesController;
  configurator: LendingPoolConfigurator;
  oracle: PriceOracle;
  helpersContract: SturdyProtocolDataProvider;
  dai: MintableERC20;
  aDai: AToken;
  usdc: SwapinERC20;
  aUsdc: AToken;
  aYVWFTM: AToken;
  aMOOWETH: AToken;
  WFTM: MintableERC20;
  WETH: SwapinERC20;
  brick: SturdyToken;
  yvwftm: IERC20Detailed;
  mooweth: IERC20Detailed;
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
  beefyVault: {} as BeefyVault,
  incentiveController: {} as StakedTokenIncentivesController,
  configurator: {} as LendingPoolConfigurator,
  helpersContract: {} as SturdyProtocolDataProvider,
  oracle: {} as PriceOracle,
  dai: {} as MintableERC20,
  aDai: {} as AToken,
  usdc: {} as SwapinERC20,
  aUsdc: {} as AToken,
  aYVWFTM: {} as AToken,
  aMOOWETH: {} as AToken,
  WFTM: {} as MintableERC20,
  WETH: {} as SwapinERC20,
  brick: {} as SturdyToken,
  yvwftm: {} as IERC20Detailed,
  mooweth: {} as IERC20Detailed,
  addressesProvider: {} as LendingPoolAddressesProvider,
  registry: {} as LendingPoolAddressesProviderRegistry,
} as TestEnv;

export async function initializeMakeSuite() {
  // Mainnet missing addresses
  const poolConfig = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
  const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>DRE.network.name;
  const yvwftmAddress = getParamPerNetwork(poolConfig.YearnVaultFTM, network);
  const moowethAddress = getParamPerNetwork(poolConfig.BeefyVaultFTM, network);
  const wftmAddress = getParamPerNetwork(poolConfig.WFTM, network);
  const wethAddress = getParamPerNetwork(poolConfig.WETH, network);

  const [_deployer, ...restSigners] = await getEthersSigners();
  let deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  let emergencyUser: SignerWithAddress = {
    address: await restSigners[0].getAddress(),
    signer: restSigners[0],
  };

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
  testEnv.beefyVault = await getBeefyVault();
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
  const aDaiAddress = allTokens.find((aToken) => aToken.symbol === 'aDAI')?.tokenAddress;

  const aYVWFTMAddress = allTokens.find((aToken) => aToken.symbol === 'ayvWFTM')?.tokenAddress;
  const aMOOWETHAddress = allTokens.find((aToken) => aToken.symbol === 'amooWETH')?.tokenAddress;
  const aUsdcAddress = allTokens.find((aToken) => aToken.symbol === 'aUSDC')?.tokenAddress;

  const reservesTokens = await testEnv.helpersContract.getAllReservesTokens();

  const daiAddress = reservesTokens.find((token) => token.symbol === 'DAI')?.tokenAddress;
  const usdcAddress = reservesTokens.find((token) => token.symbol === 'USDC')?.tokenAddress;

  if (!aDaiAddress || !aYVWFTMAddress) {
    process.exit(1);
  }
  if (!daiAddress || !usdcAddress) {
    process.exit(1);
  }

  testEnv.aDai = await getAToken(aDaiAddress);
  testEnv.aYVWFTM = await getAToken(aYVWFTMAddress);
  testEnv.aMOOWETH = await getAToken(aMOOWETHAddress);
  testEnv.aUsdc = await getAToken(aUsdcAddress);

  testEnv.dai = await getMintableERC20(daiAddress);
  testEnv.usdc = await getSwapinERC20(usdcAddress);
  testEnv.WFTM = await getMintableERC20(wftmAddress);
  testEnv.WETH = await getSwapinERC20(wethAddress);
  testEnv.brick = await getSturdyToken();
  testEnv.yvwftm = IERC20DetailedFactory.connect(yvwftmAddress, deployer.signer);
  testEnv.mooweth = IERC20DetailedFactory.connect(moowethAddress, deployer.signer);
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
