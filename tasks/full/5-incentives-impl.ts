import { task } from 'hardhat/config';
import { deployAaveIncentivesController } from '../../helpers/contracts-deployments';
import { loadPoolConfig, ConfigNames } from '../../helpers/configuration';
import { eNetwork } from '../../helpers/types';
import { exit } from 'process';
import { getAaveIncentivesController } from '../../helpers/contracts-getters';

const AAVE_STAKE = '0x4da27a545c0c5B758a6BA100e3a049001de870f5';
const AAVE_SHORT_EXECUTOR = '0xee56e2b3d491590b5b31738cc34d5232f378a8d5';

task('full:deploy-incentives-impl', 'Incentives controller implementation deployment')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, pool }, localBRE) => {
    try {
      await localBRE.run('set-DRE');
      const network = <eNetwork>localBRE.network.name;
      const poolConfig = loadPoolConfig(pool);

      await deployAaveIncentivesController([AAVE_STAKE, AAVE_SHORT_EXECUTOR], verify);

      const incentives = await getAaveIncentivesController();
      console.log(`- Incentives implementation address ${incentives.address}`);
    } catch (err) {
      console.error(err);
      exit(1);
    }
  });
