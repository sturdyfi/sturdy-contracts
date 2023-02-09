import { task } from 'hardhat/config';
import { deployLDOStableYieldDistribution } from '../../helpers/contracts-deployments';
import { ConfigNames } from '../../helpers/configuration';
import { exit } from 'process';

task(
  'full:deploy-LDO-stable-yield-distributor',
  'Stable Yield Distributor for LDO token deployment'
)
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, pool }, localBRE) => {
    try {
      await localBRE.run('set-DRE');

      const LDOStableYieldDistributor = await deployLDOStableYieldDistribution();
      await LDOStableYieldDistributor.setRewardInfo('0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32');
      console.log(`- Incentives proxy address ${LDOStableYieldDistributor.address}`);
    } catch (err) {
      console.error(err);
      exit(1);
    }
  });
