import { task } from 'hardhat/config';
import { checkVerification } from '../../helpers/etherscan-verification';
import { ConfigNames } from '../../helpers/configuration';
import { printContracts } from '../../helpers/misc-utils';
import { usingTenderly } from '../../helpers/tenderly-utils';

task('sturdy:eth', 'Deploy development enviroment')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addFlag('skipRegistry', 'Skip addresses provider registration at Addresses Provider Registry')
  .setAction(async ({ verify, skipRegistry }, DRE) => {
    const POOL_NAME = ConfigNames.Eth;
    await DRE.run('set-DRE');

    // Prevent loss of gas verifying all the needed ENVs for Etherscan verification
    if (verify) {
      checkVerification();
    }

    console.log('Migration started\n');

    console.log('1. Deploy address provider');
    await DRE.run('full:deploy-address-provider', { pool: POOL_NAME, skipRegistry, verify });

    console.log('2. Deploy lending pool');
    await DRE.run('full:deploy-lending-pool', { pool: POOL_NAME, verify });

    console.log('3. Deploy oracles');
    await DRE.run('full:deploy-oracles', { pool: POOL_NAME, verify });

    console.log('4. Deploy Data Provider');
    await DRE.run('full:data-provider', { pool: POOL_NAME, verify });

    console.log('5. Deploy Incentives impl');
    await DRE.run('full:deploy-incentives-impl', { pool: POOL_NAME, verify });

    console.log('5-1. Deploy LDO Stable Yield Distributor');
    await DRE.run('full:deploy-LDO-stable-yield-distributor', { pool: POOL_NAME, verify });

    console.log('5-2. Deploy Variable Yield Distributor');
    await DRE.run('full:deploy-variable-yield-distributor', { pool: POOL_NAME, verify });

    console.log('6. Deploy Convex ETH STETH vault');
    await DRE.run('full:eth:deploy-convex-eth-steth-vault', { pool: POOL_NAME, verify });

    console.log('6-1. Deploy Aura WSTETH WETH vault');
    await DRE.run('full:eth:deploy-aura-wsteth-weth-vault', { pool: POOL_NAME, verify });

    console.log('6-2. Deploy Aura RETH WETH vault');
    await DRE.run('full:eth:deploy-aura-reth-weth-vault', { pool: POOL_NAME, verify });

    console.log('8. Initialize lending pool');
    await DRE.run('full:initialize-lending-pool', { pool: POOL_NAME, verify });

    console.log('8-1. Deploy Collateral Adapter');
    await DRE.run('full:deploy-collateral-adapter', { pool: POOL_NAME, verify });

    // console.log('8-2. Deploy Liquidator');
    // await DRE.run('full:deploy-liquidator', { pool: POOL_NAME });

    // console.log('8-3. Deploy Vault Helper');
    // await DRE.run('full:deploy-vault-helper', { pool: POOL_NAME, verify });

    console.log('8-4. Deploy Yield Manager');
    await DRE.run('full:eth:deploy-yield-manager', { pool: POOL_NAME, verify });

    console.log('8-5. Deploy Leverage Swap Manager');
    await DRE.run('full:eth:deploy-leverage-swap-manager', { pool: POOL_NAME, verify });

    console.log('8-6. Deploy APR Data Provider');
    await DRE.run('full:eth:deploy-sturdy-apr-data-provider', { pool: POOL_NAME, verify });

    console.log('8-7. Deploy WETH Gateway');
    await DRE.run('full:eth:deploy-weth-gateway', { pool: POOL_NAME, verify });

    if (usingTenderly()) {
      const postDeployHead = DRE.tenderlyNetwork.getHead();
      const postDeployFork = DRE.tenderlyNetwork.getFork();
      console.log('Tenderly Info');
      console.log('- Head', postDeployHead);
      console.log('- Fork', postDeployFork);
    }
    console.log('\nFinished migrations');
    printContracts();
  });
