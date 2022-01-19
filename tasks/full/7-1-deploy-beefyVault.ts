import { task } from 'hardhat/config';
import { ConfigNames } from '../../helpers/configuration';
import { deployBeefyVault } from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy } from '../../helpers/contracts-getters';

const CONTRACT_NAME = 'BeefyVault';

task(`full:deploy-beefy-vault`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }
    const beefyVault = await deployBeefyVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(beefyVault.address);
    console.log(`${CONTRACT_NAME}.address`, beefyVault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
