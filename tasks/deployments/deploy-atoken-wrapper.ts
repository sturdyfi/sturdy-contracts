import { task } from 'hardhat/config';
import { deployStaticAToken } from '../../helpers/contracts-deployments';
import { getFirstSigner } from '../../helpers/contracts-getters';
import { IERC20Detailed } from '../../types';
import { IERC20DetailedFactory } from '../../types';

task(
  `deploy-atoken-wrapper`,
  `Deploy AToken Wrapper proxied with InitializableImmutableAdminUpgradeabilityProxy`
)
  .addParam('pool', 'Lending Pool address')
  .addParam('atoken', 'AToken proxy address')
  .addParam('proxyadmin', 'Ethereum address of the proxy admin')
  .addFlag('verify', 'Verify UiPoolDataProvider contract via Etherscan API.')
  .setAction(
    async (
      {
        pool,
        atoken,
        proxyadmin,
        verify,
      }: {
        pool: string;
        atoken: string;
        verify: boolean;
        proxyadmin: string;
      },
      localBRE
    ) => {
      await localBRE.run('set-DRE');

      // Load symbol from AToken proxy contract
      const symbol = await IERC20DetailedFactory.connect(atoken, await getFirstSigner()).symbol();

      console.log('- Deploying Static Wrapper for', symbol);
      const { proxy, implementation } = await deployStaticAToken(
        [pool, atoken, symbol, proxyadmin],
        verify
      );

      console.log('- Deployed Static Wrapper for', symbol);
      console.log('  - Proxy: ', proxy);
      console.log('  - Impl : ', implementation);
    }
  );
