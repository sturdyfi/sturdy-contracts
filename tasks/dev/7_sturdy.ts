import { task } from 'hardhat/config';
import { deploySturdy } from '../../helpers/contracts-deployments';

task('dev:sturdy', 'Deploy sturdy.')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('lendingPool', `LendingPool address to interact with aave`)
  .setAction(async ({ lendingPool, verify }, localBRE) => {
    await localBRE.run('set-DRE');

    console.log('\tDeploying sturdy implementation...');
    await deploySturdy([lendingPool], verify);
  });
