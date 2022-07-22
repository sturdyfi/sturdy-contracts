import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  deployDAIUSDCUSDTSUSDOracle,
  deployConvexDAIUSDCUSDTSUSDVault,
} from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy, getSturdyOracle } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'ConvexDAIUSDCUSDTSUSDVault';

task(`full:deploy-convex-dai-usdc-usdt-susd-vault`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveFactorTreasuryAddress, ChainlinkAggregator, DAI_USDC_USDT_SUSD_LP } =
      poolConfig as ISturdyConfiguration;
    const treasuryAddress = getParamPerNetwork(ReserveFactorTreasuryAddress, network);

    const vault = await deployConvexDAIUSDCUSDTSUSDVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(vault.address);
    await vault.setTreasuryInfo(treasuryAddress, '1000'); //10% fee
    await vault.setConfiguration(getParamPerNetwork(DAI_USDC_USDT_SUSD_LP, network), 4); // set curve lp token & convex pool id
    await vault.setIncentiveRatio('7500');

    const internalAssetAddress = await vault.getInternalAsset();
    console.log(`internal token: ${internalAssetAddress}`);

    // Deploy DAIUSDCUSDTSUSD oracle
    let DAIUSDCUSDTSUSDOracleAddress = getParamPerNetwork(
      ChainlinkAggregator,
      network
    ).cvxDAI_USDC_USDT_SUSD;
    if (!DAIUSDCUSDTSUSDOracleAddress) {
      const DAIUSDCUSDTSUSDOracle = await deployDAIUSDCUSDTSUSDOracle(verify);
      DAIUSDCUSDTSUSDOracleAddress = DAIUSDCUSDTSUSDOracle.address;
    }

    // Register cDAIUSDCUSDTSUSD-f
    const sturdyOracle = await getSturdyOracle();
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [internalAssetAddress, getParamPerNetwork(DAI_USDC_USDT_SUSD_LP, network)],
        [DAIUSDCUSDTSUSDOracleAddress, DAIUSDCUSDTSUSDOracleAddress]
      )
    );
    console.log((await sturdyOracle.getAssetPrice(internalAssetAddress)).toString());

    console.log(`${CONTRACT_NAME}.address`, vault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
