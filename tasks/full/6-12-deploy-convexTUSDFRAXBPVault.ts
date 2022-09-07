import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  deployConvexTUSDFRAXBPVault,
  deployTUSDFRAXBPCOracle,
} from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy, getSturdyOracle } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'ConvexTUSDFRAXBPVault';

task(`full:deploy-convex-tusd-fraxbp-vault`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }
    console.log(localBRE.network.name);

    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveAssets, ReserveFactorTreasuryAddress, ChainlinkAggregator, TUSD_FRAXBP_LP } =
      poolConfig as ISturdyConfiguration;
    const treasuryAddress = getParamPerNetwork(ReserveFactorTreasuryAddress, network);

    const vault = await deployConvexTUSDFRAXBPVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(vault.address);
    await vault.setTreasuryInfo(treasuryAddress, '1000'); //10% fee
    await vault.setConfiguration(getParamPerNetwork(TUSD_FRAXBP_LP, network), 108); // set curve lp token & convex pool id
    await vault.setIncentiveRatio('7500');

    const internalAssetAddress = await vault.getInternalAsset();
    ReserveAssets[network].cvxTUSD_FRAXBP = internalAssetAddress;
    console.log(`internal token: ${internalAssetAddress}`);

    // Deploy TUSDFRAXBPOracle oracle
    let TUSDFRAXBPOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).cvxTUSD_FRAXBP;
    if (!TUSDFRAXBPOracleAddress) {
      const TUSDFRAXBPOracle = await deployTUSDFRAXBPCOracle(verify);
      TUSDFRAXBPOracleAddress = TUSDFRAXBPOracle.address;
    }

    // Register
    const sturdyOracle = await getSturdyOracle();
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [internalAssetAddress, getParamPerNetwork(TUSD_FRAXBP_LP, network)],
        [TUSDFRAXBPOracleAddress, TUSDFRAXBPOracleAddress]
      )
    );
    console.log((await sturdyOracle.getAssetPrice(internalAssetAddress)).toString());

    console.log(`${CONTRACT_NAME}.address`, vault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
