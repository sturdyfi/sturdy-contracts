import { task } from 'hardhat/config';
import { eEthereumNetwork, eNetwork, ICommonConfiguration } from '../../helpers/types';
import * as marketConfigs from '../../markets/sturdy';
import * as reserveConfigs from '../../markets/sturdy/reservesConfigs';
import { getLendingPoolConfiguratorProxy } from '../../helpers/contracts-getters';
import { setDRE } from '../../helpers/misc-utils';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';

const isSymbolValid = (symbol: string, network: eEthereumNetwork) =>
  Object.keys(reserveConfigs).includes('strategy' + symbol.toUpperCase()) &&
  marketConfigs.SturdyConfig.ReserveAssets[network][symbol] &&
  marketConfigs.SturdyConfig.ReservesConfig[symbol] ===
    reserveConfigs['strategy' + symbol.toUpperCase()];

task('external:change-asset-strategy', 'Change the assets strategy params')
  .addParam('symbol', `Asset symbol, needs to have configuration ready`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ symbol, pool }, localBRE) => {
    const network = <eNetwork>localBRE.network.name;
    if (!isSymbolValid(symbol, network as eEthereumNetwork)) {
      throw new Error(
        `
WRONG RESERVE ASSET SETUP:
        The symbol ${symbol} has no reserve Config and/or reserve Asset setup.
        update /markets/sturdy/index.ts and add the asset address for ${network} network
        update /markets/sturdy/reservesConfigs.ts and add parameters for ${symbol}
        `
      );
    }
    setDRE(localBRE);
    const poolConfig = loadPoolConfig(pool);
    const { ReserveAssets } = poolConfig as ICommonConfiguration;
    const reserveAssets = await getParamPerNetwork(ReserveAssets, network);
    const strategyParams = reserveConfigs['strategy' + symbol.toUpperCase()];
    const lendingPoolConf = await getLendingPoolConfiguratorProxy();
    await lendingPoolConf.configureReserveAsCollateral(
      reserveAssets[symbol],
      strategyParams.baseLTVAsCollateral,
      strategyParams.liquidationThreshold,
      strategyParams.liquidationBonus
    );
  });
