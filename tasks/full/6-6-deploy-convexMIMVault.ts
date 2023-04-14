import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  deployMIM3CRVOracle,
  deployConvexMIM3CRVVault,
  deployMIMOracle,
} from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy, getSturdyOracle } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'ConvexMIM3CRVVault';

task(`full:deploy-convex-mim-3crv-vault`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveAssets, ReserveFactorTreasuryAddress, ChainlinkAggregator, MIM_3CRV_LP, MIM } =
      poolConfig as ISturdyConfiguration;
    const treasuryAddress = getParamPerNetwork(ReserveFactorTreasuryAddress, network);

    const vault = await deployConvexMIM3CRVVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(vault.address);
    await vault.setTreasuryInfo(treasuryAddress, '1000'); //10% fee
    await vault.setConfiguration(getParamPerNetwork(MIM_3CRV_LP, network), 40); // set curve lp token & convex pool id
    await vault.setIncentiveRatio('7500');

    const internalAssetAddress = await vault.getInternalAsset();
    ReserveAssets[network].cvxMIM_3CRV = internalAssetAddress;
    console.log(`internal token: ${internalAssetAddress}`);

    // Deploy MIM3CRV oracle
    let MIM3CRVOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).cvxMIM_3CRV;
    if (!MIM3CRVOracleAddress) {
      const MIM3CRVOracle = await deployMIM3CRVOracle(verify);
      MIM3CRVOracleAddress = MIM3CRVOracle.address;
    }

    let MIMOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).MIM;
    if (!MIMOracleAddress) {
      const MIMOracle = await deployMIMOracle(verify);
      MIMOracleAddress = MIMOracle.address;
    }

    // Register cMIM3CRV-f
    const sturdyOracle = await getSturdyOracle();
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [
          internalAssetAddress,
          getParamPerNetwork(MIM_3CRV_LP, network),
          getParamPerNetwork(MIM, network),
        ],
        [MIM3CRVOracleAddress, MIM3CRVOracleAddress, MIMOracleAddress]
      )
    );
    console.log((await sturdyOracle.getAssetPrice(internalAssetAddress)).toString());
    console.log((await sturdyOracle.getAssetPrice(getParamPerNetwork(MIM, network))).toString());

    console.log(`${CONTRACT_NAME}.address`, vault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
