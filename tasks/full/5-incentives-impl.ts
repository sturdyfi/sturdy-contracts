import { task } from 'hardhat/config';
import {
  deployStableYieldDistributionImpl,
  deploySturdyIncentivesController,
  deploySturdyToken,
  deployVariableYieldDistributionImpl,
  deployYieldDistributorAdapter,
} from '../../helpers/contracts-deployments';
import { ConfigNames } from '../../helpers/configuration';
import { exit } from 'process';
import { getFirstSigner } from '../../helpers/contracts-getters';

task('full:deploy-incentives-impl', 'Incentives controller implementation deployment')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, pool }, localBRE) => {
    try {
      await localBRE.run('set-DRE');
      const signer = await getFirstSigner();
      const EMISSION_EXECUTOR = await signer.getAddress();

      const incentives = await deploySturdyIncentivesController([EMISSION_EXECUTOR], verify);
      console.log(`- Incentives proxy address ${incentives.address}`);

      const sturdyToken = await deploySturdyToken(verify);
      console.log(`- Incentives sturdy token proxy address ${sturdyToken.address}`);

      const stableYieldDistributorImpl = await deployStableYieldDistributionImpl(
        [EMISSION_EXECUTOR],
        verify
      );
      console.log(`- Stable Yield Distributor Impl address ${stableYieldDistributorImpl.address}`);
      const variableYieldDistributorImpl = await deployVariableYieldDistributionImpl(
        [EMISSION_EXECUTOR],
        verify
      );
      console.log(
        `- Variable Yield Distributor Impl address ${variableYieldDistributorImpl.address}`
      );

      const yieldDistributorAdapter = await deployYieldDistributorAdapter(
        [EMISSION_EXECUTOR],
        verify
      );
      console.log(`- Yield Distributor Adapter address ${yieldDistributorAdapter.address}`);
    } catch (err) {
      console.error(err);
      exit(1);
    }
  });
