import { task } from 'hardhat/config';
import { deployStaticAToken } from '../../helpers/contracts-deployments';
import { getFirstSigner } from '../../helpers/contracts-getters';
import { IERC20Detailed__factory, LendingPool__factory } from '../../types';

task(
  `deploy-atoken-wrapper`,
  `Deploy AToken Wrapper proxied with InitializableImmutableAdminUpgradeabilityProxy`
)
  .addParam('pool', 'Lending Pool address')
  .addParam('reserve', 'reserve address')
  .addParam('proxyadmin', 'Ethereum address of the proxy admin')
  .addFlag('verify', 'Verify UiPoolDataProvider contract via Etherscan API.')
  .setAction(
    async (
      {
        pool,
        reserve,
        proxyadmin,
        verify,
      }: {
        pool: string;
        reserve: string;
        verify: boolean;
        proxyadmin: string;
      },
      localBRE
    ) => {
      await localBRE.run('set-DRE');

      const lendingPoolProxy = LendingPool__factory.connect(pool, await getFirstSigner());

      const { aTokenAddress } = await lendingPoolProxy.getReserveData(reserve);

      // Load symbol from AToken proxy contract
      const symbol = await IERC20Detailed__factory.connect(
        aTokenAddress,
        await getFirstSigner()
      ).symbol();

      console.log('- Deploying Static Wrapper for', symbol);
      const { proxy, implementation } = await deployStaticAToken(
        [pool, aTokenAddress, symbol, proxyadmin],
        verify
      );

      console.log('- Deployed Static Wrapper for', symbol);
      console.log('  - Proxy: ', proxy);
      console.log('  - Impl : ', implementation);
    }
  );
