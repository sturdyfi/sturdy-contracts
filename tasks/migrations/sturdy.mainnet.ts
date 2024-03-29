import { task } from 'hardhat/config';
import { checkVerification } from '../../helpers/etherscan-verification';
import { ConfigNames } from '../../helpers/configuration';
import { printContracts } from '../../helpers/misc-utils';
import { usingTenderly } from '../../helpers/tenderly-utils';

task('sturdy:mainnet', 'Deploy development enviroment')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addFlag('skipRegistry', 'Skip addresses provider registration at Addresses Provider Registry')
  .setAction(async ({ verify, skipRegistry }, DRE) => {
    const POOL_NAME = ConfigNames.Sturdy;
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

    console.log('6. Deploy Lido vault');
    await DRE.run('full:deploy-lido-vault', { pool: POOL_NAME, verify });

    // console.log('6-1. Deploy Yearn RETH_WSTETH vault');
    // await DRE.run('full:deploy-yearn-reth-wsteth-vault', { pool: POOL_NAME });

    // console.log('6-2. Deploy Convex Rocket Pool ETH vault');
    // await DRE.run('full:deploy-convex-rocket-pool-eth-vault', { pool: POOL_NAME });

    console.log('6-3. Deploy Convex FRAX 3CRV vault');
    await DRE.run('full:deploy-convex-frax-3crv-vault', { pool: POOL_NAME, verify });

    // console.log('6-4. Deploy Convex STETH vault');
    // await DRE.run('full:deploy-convex-steth-vault', { pool: POOL_NAME });

    // console.log('6-5. Deploy Convex DOLA 3CRV vault');
    // await DRE.run('full:deploy-convex-dola-3crv-vault', { pool: POOL_NAME });

    console.log('6-6. Deploy Convex MIM 3CRV vault');
    await DRE.run('full:deploy-convex-mim-3crv-vault', { pool: POOL_NAME, verify });

    console.log('6-7. Deploy Convex DAI USDC USDT SUSD vault');
    await DRE.run('full:deploy-convex-dai-usdc-usdt-susd-vault', { pool: POOL_NAME, verify });

    // console.log('6-8. Deploy Convex HBTC WBTC vault');
    // await DRE.run('full:deploy-convex-hbtc-wbtc-vault', { pool: POOL_NAME, verify });

    // console.log('6-9. Deploy Convex Iron Bank vault');
    // await DRE.run('full:deploy-convex-iron-bank-vault', { pool: POOL_NAME, verify });

    console.log('6-10. Deploy Convex FRAX USDC vault');
    await DRE.run('full:deploy-convex-frax-usdc-vault', { pool: POOL_NAME, verify });

    // console.log('6-11. Deploy Aura DAI USDC USDT vault');
    // await DRE.run('full:deploy-aura-dai-usdc-usdt-vault', { pool: POOL_NAME, verify });

    console.log('6-12. Deploy Convex TUSD FRAXBP vault');
    await DRE.run('full:deploy-convex-tusd-fraxbp-vault', { pool: POOL_NAME, verify });

    // console.log('6-13. Deploy Aura BB-A-USD vault');
    // await DRE.run('full:deploy-aura-bb-a-usd-vault', { pool: POOL_NAME, verify });

    console.log('6-14. Deploy Aura BB-A3-USD vault');
    await DRE.run('full:deploy-aura-bb-a3-usd-vault', { pool: POOL_NAME, verify });

    console.log('8. Initialize lending pool');
    await DRE.run('full:initialize-lending-pool', { pool: POOL_NAME, verify });

    console.log('8-1. Deploy Collateral Adapter');
    await DRE.run('full:deploy-collateral-adapter', { pool: POOL_NAME, verify });

    // console.log('8-2. Deploy Liquidator');
    // await DRE.run('full:deploy-liquidator', { pool: POOL_NAME });

    console.log('8-3. Deploy Vault Helper');
    await DRE.run('full:deploy-vault-helper', { pool: POOL_NAME, verify });

    console.log('8-4. Deploy Yield Manager');
    await DRE.run('full:deploy-yield-manager', { pool: POOL_NAME, verify });

    console.log('8-5. Deploy Leverage Swap Manager');
    await DRE.run('full:deploy-leverage-swap-manager', { pool: POOL_NAME, verify });

    console.log('8-6. Deploy APR Data Provider');
    await DRE.run('full:deploy-sturdy-apr-data-provider', { pool: POOL_NAME, verify });

    // if (verify) {
    //   printContracts();
    //   console.log('9. Veryfing contracts');
    //   await DRE.run('verify:general', { all: true, pool: POOL_NAME });

    //   console.log('10. Veryfing aTokens and debtTokens');
    //   await DRE.run('verify:tokens', { pool: POOL_NAME });
    // }

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
