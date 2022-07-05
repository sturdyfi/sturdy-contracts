import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  getFirstSigner,
  getLendingPoolAddressesProvider,
  getLendingPoolConfiguratorProxy,
  getConvexFRAX3CRVVault,
  getConvexDAIUSDCUSDTSUSDVault,
} from '../../helpers/contracts-getters';
import {
  deployLeverageSwapManager,
  deploy3CrvFraxLevSwap,
  deployCrvPlain3SUSDLevSwap,
} from '../../helpers/contracts-deployments';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { ThreeCrvFraxLevSwap, CrvPlain3SUSDLevSwap } from '../../types';

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

    // deploy & register 3CrvFraxLevSwap
    const fraxVault = await getConvexFRAX3CRVVault();
    const fraxLevSwap = await deploy3CrvFraxLevSwap([
      getParamPerNetwork(FRAX_3CRV_LP, network),
      fraxVault.address,
      addressProvider.address,
    ]);

    await leverageManager.registerLevSwapper(
      getParamPerNetwork(FRAX_3CRV_LP, network),
      fraxLevSwap.address
    );
    console.log('3CrvFraxLevSwap: %s', fraxLevSwap.address);

    // deploy & register CrvPlain3SUSDLevSwap
    const susdVault = await getConvexDAIUSDCUSDTSUSDVault();
    const susdLevSwap = await deployCrvPlain3SUSDLevSwap([
      getParamPerNetwork(DAI_USDC_USDT_SUSD_LP, network),
      susdVault.address,
      addressProvider.address,
    ]);

    await leverageManager.registerLevSwapper(
      getParamPerNetwork(DAI_USDC_USDT_SUSD_LP, network),
      susdLevSwap.address
    );
    console.log('CrvPlain3SUSDLevSwap: %s', susdLevSwap.address);

    console.log(`${CONTRACT_NAME}.address`, leverageManager.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
