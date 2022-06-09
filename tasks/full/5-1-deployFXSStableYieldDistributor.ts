import { task } from 'hardhat/config';
import { deployFXSStableYieldDistribution } from '../../helpers/contracts-deployments';
import { ConfigNames } from '../../helpers/configuration';
import { exit } from 'process';
import { getFirstSigner, getStableYieldDistributionImpl } from '../../helpers/contracts-getters';

task(
  'full:deploy-FXS-stable-yield-distributor',
  'Stable Yield Distributor for FXS token deployment'
)
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, pool }, localBRE) => {
    try {
      await localBRE.run('set-DRE');

      const FXSStableYieldDistributor = await deployFXSStableYieldDistribution();
      await FXSStableYieldDistributor.setRewardInfo(
        '0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0',
        27
      );
      console.log(`- Incentives proxy address ${FXSStableYieldDistributor.address}`);
    } catch (err) {
      console.error(err);
      exit(1);
    }
  });
