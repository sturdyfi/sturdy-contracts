import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import { deploySTECRVOracle, deployConvexSTETHVault } from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy, getSturdyOracle } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'ConvexSTETHVault';

task(`full:deploy-convex-steth-vault`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveAssets, ReserveFactorTreasuryAddress, ChainlinkAggregator, STECRV_LP } =
      poolConfig as ISturdyConfiguration;
    const treasuryAddress = getParamPerNetwork(ReserveFactorTreasuryAddress, network);

    const vault = await deployConvexSTETHVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(vault.address);
    await vault.setTreasuryInfo(treasuryAddress, '1000'); //10% fee
    await vault.setConfiguration(getParamPerNetwork(STECRV_LP, network), 25); // set curve lp token & convex pool id

    const internalAssetAddress = await vault.getInternalAsset();
    ReserveAssets[network].cvxSTECRV = internalAssetAddress;
    console.log(`internal token: ${internalAssetAddress}`);

    // Deploy steCRV oracle
    let steCRVOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).cvxSTECRV;
    if (!steCRVOracleAddress) {
      const steCRVOracle = await deploySTECRVOracle(verify);
      steCRVOracleAddress = steCRVOracle.address;
    }

    // Register csteCRV oracle
    const sturdyOracle = await getSturdyOracle();
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [internalAssetAddress, getParamPerNetwork(STECRV_LP, network)],
        [steCRVOracleAddress, steCRVOracleAddress],
        [false, false]
      )
    );
    console.log((await sturdyOracle.getAssetPrice(internalAssetAddress)).toString());

    console.log(`${CONTRACT_NAME}.address`, vault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
