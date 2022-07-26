import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  getLendingPoolAddressesProvider,
  getConvexFRAX3CRVVault,
  getConvexDAIUSDCUSDTSUSDVault,
} from '../../helpers/contracts-getters';
import {
  deployLeverageSwapManager,
  deployFRAX3CRVLevSwap,
  deployDAIUSDCUSDTSUSDLevSwap,
} from '../../helpers/contracts-deployments';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';

const CONTRACT_NAME = 'LeverageSwapManager';

task(`full:deploy-leverage-swap-manager`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }
    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { FRAX_3CRV_LP, DAI_USDC_USDT_SUSD_LP, ReserveAssets } =
      poolConfig as ISturdyConfiguration;

    const addressProvider = await getLendingPoolAddressesProvider();

    const leverageManager = await deployLeverageSwapManager(verify);

    // deploy & register FRAX3CRVLevSwap
    const fraxVault = await getConvexFRAX3CRVVault();
    const fraxLevSwap = await deployFRAX3CRVLevSwap(
      [getParamPerNetwork(FRAX_3CRV_LP, network), fraxVault.address, addressProvider.address],
      verify
    );

    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).cvxFRAX_3CRV,
      fraxLevSwap.address
    );
    console.log('FRAX3CRVLevSwap: %s', fraxLevSwap.address);

    // deploy & register DAIUSDCUSDTSUSDLevSwap
    const susdVault = await getConvexDAIUSDCUSDTSUSDVault();
    const susdLevSwap = await deployDAIUSDCUSDTSUSDLevSwap(
      [
        getParamPerNetwork(DAI_USDC_USDT_SUSD_LP, network),
        susdVault.address,
        addressProvider.address,
      ],
      verify
    );

    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).cvxDAI_USDC_USDT_SUSD,
      susdLevSwap.address
    );
    console.log('DAIUSDCUSDTSUSDLevSwap: %s', susdLevSwap.address);

    console.log(`${CONTRACT_NAME}.address`, leverageManager.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
