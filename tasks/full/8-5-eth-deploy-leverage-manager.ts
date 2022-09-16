import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  getLendingPoolAddressesProvider,
  getConvexETHSTETHVault,
} from '../../helpers/contracts-getters';
import {
  deployLeverageSwapManager,
  deployETHSTETHLevSwap,
} from '../../helpers/contracts-deployments';
import { eNetwork, IEthConfiguration } from '../../helpers/types';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';

const CONTRACT_NAME = 'LeverageSwapManager';

task(`full:eth:deploy-leverage-swap-manager`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }
    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ETH_STETH_LP, ReserveAssets } = poolConfig as IEthConfiguration;

    const addressProvider = await getLendingPoolAddressesProvider();

    const leverageManager = await deployLeverageSwapManager(verify);

    // deploy & register ETHSTETHLevSwap
    const ethstethVault = await getConvexETHSTETHVault();
    const ethstethLevSwap = await deployETHSTETHLevSwap(
      [getParamPerNetwork(ETH_STETH_LP, network), ethstethVault.address, addressProvider.address],
      verify
    );

    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).cvxETH_STETH,
      ethstethLevSwap.address
    );
    console.log('ETHSTETHLevSwap: %s', ethstethLevSwap.address);

    console.log(`${CONTRACT_NAME}.address`, leverageManager.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });