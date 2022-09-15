import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import { deploySturdyAPRDataProvider } from '../../helpers/contracts-deployments';
import {
  getLendingPoolAddressesProvider,
  getSturdyProtocolDataProvider,
} from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, IEthConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'SturdyAPRDataProvider';

task(`full:eth:deploy-sturdy-apr-data-provider`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }
    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveAssets } = poolConfig as IEthConfiguration;

    const addressesProvider = await getLendingPoolAddressesProvider();
    const dataProvider = await getSturdyProtocolDataProvider();
    const aprProvider = await deploySturdyAPRDataProvider([dataProvider.address], verify);
    await waitForTx(
      await addressesProvider.setAddress(
        localBRE.ethers.utils.formatBytes32String('APR_PROVIDER'),
        aprProvider.address
      )
    );

    console.log(`${CONTRACT_NAME}.address`, aprProvider.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
