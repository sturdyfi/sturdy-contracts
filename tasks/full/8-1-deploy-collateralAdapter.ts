import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import { deployCollateralAdapter } from '../../helpers/contracts-deployments';
import { getConvexETHSTETHVault, getAuraWSTETHWETHVault } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import {
  eContractid,
  eNetwork,
  ICommonConfiguration,
  IEthConfiguration,
  IReserveParams,
} from '../../helpers/types';

const CONTRACT_NAME = 'CollateralAdapter';

task(`full:deploy-collateral-adapter`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }
    const collateralAdapter = await deployCollateralAdapter(verify);
    const network = <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveAssets, ReservesConfig } = poolConfig as ICommonConfiguration;
    const reserveAssets = getParamPerNetwork(ReserveAssets, network);
    const reserveExternalAssets = {
      cvxETH_STETH: getParamPerNetwork((poolConfig as IEthConfiguration).ETH_STETH_LP, network),
      auraWSTETH_WETH: getParamPerNetwork(
        (poolConfig as IEthConfiguration).BAL_WSTETH_WETH_LP,
        network
      ),
    };

    const acceptableVaults = {
      cvxETH_STETH: (await getConvexETHSTETHVault()).address,
      auraWSTETH_WETH: (await getAuraWSTETHWETHVault()).address,
    };

    const reserves = Object.entries(ReservesConfig).filter(
      ([_, { aTokenImpl }]) => aTokenImpl === eContractid.ATokenForCollateral
    ) as [string, IReserveParams][];

    for (let [symbol, params] of reserves) {
      if (!reserveAssets[symbol]) {
        console.log(`- Skipping init of ${symbol} due token address is not set at markets config`);
        continue;
      }

      await waitForTx(
        await collateralAdapter.addCollateralAsset(
          reserveExternalAssets[symbol],
          reserveAssets[symbol],
          acceptableVaults[symbol]
        )
      );
    }

    console.log(`${CONTRACT_NAME}.address`, collateralAdapter.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
