import { task } from 'hardhat/config';
import { deployVariableYieldDistribution } from '../../helpers/contracts-deployments';
import { ConfigNames } from '../../helpers/configuration';
import { exit } from 'process';
import { getFirstSigner, getStableYieldDistributionImpl } from '../../helpers/contracts-getters';

task('full:deploy-variable-yield-distributor', 'Variable Yield Distributor')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, pool }, localBRE) => {
    try {
      await localBRE.run('set-DRE');

      const VariableYieldDistributor = await deployVariableYieldDistribution();
      console.log(`- VariableYieldDistributor proxy address ${VariableYieldDistributor.address}`);
    } catch (err) {
      console.error(err);
      exit(1);
    }
  });
