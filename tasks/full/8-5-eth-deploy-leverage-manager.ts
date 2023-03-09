import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  getLendingPoolAddressesProvider,
  getConvexETHSTETHVault,
  getAuraWSTETHWETHVault,
  getAuraRETHWETHVault,
} from '../../helpers/contracts-getters';
import {
  deployLeverageSwapManager,
  deployETHSTETHLevSwap,
  deployAURAWSTETHWETHLevSwap,
  deployAURARETHWETHLevSwap,
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
    const { ETH_STETH_LP, BAL_WSTETH_WETH_LP, BAL_RETH_WETH_LP, ReserveAssets } =
      poolConfig as IEthConfiguration;

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

    // deploy & register AURAWSTETHWETHLevSwap
    const aurawstethwethVault = await getAuraWSTETHWETHVault();
    const aurawstethwethLevSwap = await deployAURAWSTETHWETHLevSwap(
      [
        getParamPerNetwork(BAL_WSTETH_WETH_LP, network),
        aurawstethwethVault.address,
        addressProvider.address,
      ],
      verify
    );

    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).auraWSTETH_WETH,
      aurawstethwethLevSwap.address
    );
    console.log('AURAWSTETHWETHLevSwap: %s', aurawstethwethLevSwap.address);

    // deploy & register AURARETHWETHLevSwap
    const aurarethwethVault = await getAuraRETHWETHVault();
    const aurarethwethLevSwap = await deployAURARETHWETHLevSwap(
      [
        getParamPerNetwork(BAL_RETH_WETH_LP, network),
        aurarethwethVault.address,
        addressProvider.address,
      ],
      verify
    );

    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).auraRETH_WETH,
      aurarethwethLevSwap.address
    );
    console.log('AURARETHWETHLevSwap: %s', aurarethwethLevSwap.address);

    console.log(`${CONTRACT_NAME}.address`, leverageManager.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
