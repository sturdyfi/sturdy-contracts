import { task } from 'hardhat/config';
import {
  deploySturdyIncentivesController,
  deploySturdyToken,
} from '../../helpers/contracts-deployments';
import { ConfigNames } from '../../helpers/configuration';
import { exit } from 'process';
import {
  getFirstSigner,
  getSturdyIncentivesController,
  getSturdyToken,
} from '../../helpers/contracts-getters';

task('full:deploy-incentives-impl', 'Incentives controller implementation deployment')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, pool }, localBRE) => {
    try {
      await localBRE.run('set-DRE');
      const signer = await getFirstSigner();
      const EMISSION_EXECUTOR = await signer.getAddress();

      const sturdyToken = await deploySturdyToken();
      console.log(`- Incentives sturdy token address ${sturdyToken.address}`);

      const incentives = await deploySturdyIncentivesController(
        [sturdyToken.address, EMISSION_EXECUTOR],
        verify
      );
      console.log(`- Incentives implementation address ${incentives.address}`);

      await sturdyToken.initialize(incentives.address);
    } catch (err) {
      console.error(err);
      exit(1);
    }
  });
