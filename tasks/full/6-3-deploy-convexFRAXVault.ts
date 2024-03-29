import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  deployFRAX3CRVPOracle,
  deployConvexFRAX3CRVVault,
} from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy, getSturdyOracle } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'ConvexFRAX3CRVVault';

task(`full:deploy-convex-frax-3crv-vault`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const {
      ReserveAssets,
      ReserveFactorTreasuryAddress,
      ChainlinkAggregator,
      CRV,
      CVX,
      FRAX_3CRV_LP,
    } = poolConfig as ISturdyConfiguration;
    const treasuryAddress = getParamPerNetwork(ReserveFactorTreasuryAddress, network);

    const vault = await deployConvexFRAX3CRVVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(vault.address);
    await vault.setTreasuryInfo(treasuryAddress, '1000'); //10% fee
    await vault.setConfiguration(getParamPerNetwork(FRAX_3CRV_LP, network), 32); // set curve lp token & convex pool id
    await vault.setIncentiveRatio('4000');

    const internalAssetAddress = await vault.getInternalAsset();
    ReserveAssets[network].cvxFRAX_3CRV = internalAssetAddress;
    console.log(`internal token: ${internalAssetAddress}`);

    // Deploy FRAX3CRV oracle
    let FRAX3CRVOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).cvxFRAX_3CRV;
    if (!FRAX3CRVOracleAddress) {
      const FRAX3CRVOracle = await deployFRAX3CRVPOracle(verify);
      FRAX3CRVOracleAddress = FRAX3CRVOracle.address;
    }

    // Register cFRAX3CRV-f, CRV oracle
    const sturdyOracle = await getSturdyOracle();
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [
          internalAssetAddress,
          getParamPerNetwork(FRAX_3CRV_LP, network),
          getParamPerNetwork(CRV, network),
          getParamPerNetwork(CVX, network),
        ],
        [
          FRAX3CRVOracleAddress,
          FRAX3CRVOracleAddress,
          getParamPerNetwork(ChainlinkAggregator, network).CRV,
          getParamPerNetwork(ChainlinkAggregator, network).CVX,
        ],
        [false, false, false, false]
      )
    );
    console.log((await sturdyOracle.getAssetPrice(internalAssetAddress)).toString());

    console.log((await sturdyOracle.getAssetPrice(getParamPerNetwork(CRV, network))).toString());

    console.log((await sturdyOracle.getAssetPrice(getParamPerNetwork(CVX, network))).toString());

    console.log(`${CONTRACT_NAME}.address`, vault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
