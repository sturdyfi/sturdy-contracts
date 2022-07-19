import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  deployConvexFRAXUSDCVault,
  deployFRAXUSDCOracle,
} from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy, getSturdyOracle } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'ConvexFRAXUSDCVault';

task(`full:deploy-convex-frax-usdc-vault`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveFactorTreasuryAddress, ChainlinkAggregator, FRAX_USDC_LP } =
      poolConfig as ISturdyConfiguration;
    const treasuryAddress = getParamPerNetwork(ReserveFactorTreasuryAddress, network);

    const vault = await deployConvexFRAXUSDCVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(vault.address);
    await vault.setTreasuryInfo(treasuryAddress, '1000'); //10% fee
    await vault.setConfiguration(getParamPerNetwork(FRAX_USDC_LP, network), 100); // set curve lp token & convex pool id
    await vault.setIncentiveRatio('7500');

    const internalAssetAddress = await vault.getInternalAsset();
    console.log(`internal token: ${internalAssetAddress}`);

    // Deploy FRAXUSDCOracle oracle
    let FRAXUSDCOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).cvxFRAX_USDC;
    if (!FRAXUSDCOracleAddress) {
      const FRAXUSDCOracle = await deployFRAXUSDCOracle(verify);
      FRAXUSDCOracleAddress = FRAXUSDCOracle.address;
    }

    // Register
    const sturdyOracle = await getSturdyOracle();
    await waitForTx(
      await sturdyOracle.setAssetSources([internalAssetAddress], [FRAXUSDCOracleAddress])
    );
    console.log((await sturdyOracle.getAssetPrice(internalAssetAddress)).toString());

    console.log(`${CONTRACT_NAME}.address`, vault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
