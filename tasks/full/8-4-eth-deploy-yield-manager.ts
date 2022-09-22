import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  getFirstSigner,
  getLendingPoolAddressesProvider,
  getLendingPoolConfiguratorProxy,
} from '../../helpers/contracts-getters';
import { deployYieldManager } from '../../helpers/contracts-deployments';
import { eNetwork, IEthConfiguration } from '../../helpers/types';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';

const CONTRACT_NAME = 'YieldManager';

task(`full:eth:deploy-yield-manager`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }
    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { CRV, CVX, BAL } = poolConfig as IEthConfiguration;

    const yieldManager = await deployYieldManager(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(yieldManager.address);

    // Set Exchange Token as WETH
    await yieldManager.setExchangeToken(getParamPerNetwork(poolConfig.ReserveAssets, network).WETH);

    // Register reward asset(for now CRV & CVX & BAL)
    await yieldManager.registerAsset(getParamPerNetwork(CRV, network), 0);
    await yieldManager.registerAsset(getParamPerNetwork(CVX, network), 0);
    await yieldManager.registerAsset(getParamPerNetwork(BAL, network), 1);

    const addressProvider = await getLendingPoolAddressesProvider();
    const signer = await getFirstSigner();
    const processor = await signer.getAddress();
    await waitForTx(
      await addressProvider.setAddress(
        localBRE.ethers.utils.formatBytes32String('YIELD_PROCESSOR'),
        processor
      )
    );

    console.log(`${CONTRACT_NAME}.address`, yieldManager.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
