import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  deployBeefyMIM2CRVVault,
  deployMIM2CRVLPOracle,
  deployBasedMiMaticLPOracle,
  deployBasedOracle,
} from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy, getSturdyOracle } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, IFantomConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'BeefyMIM2CRVVault';

task(`full:deploy-beefy-mim2crv-vault`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveFactorTreasuryAddress, ReserveAssets, BASED, ChainlinkAggregator } =
      poolConfig as IFantomConfiguration;
    const treasuryAddress = getParamPerNetwork(ReserveFactorTreasuryAddress, network);

    const beefyMIM2CRVVault = await deployBeefyMIM2CRVVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(beefyMIM2CRVVault.address);
    await beefyMIM2CRVVault.setTreasuryInfo(treasuryAddress, '1000'); //10% fee

    // Deploy MIM2CRV oracle
    let mooMIM2CRVOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).mooMIM_2CRV;
    if (!mooMIM2CRVOracleAddress) {
      const mooMIM2CRVOracle = await deployMIM2CRVLPOracle();
      mooMIM2CRVOracleAddress = mooMIM2CRVOracle.address;
    }

    // Register MIMATIC, mooBASED_MIMATIC oracle
    const sturdyOracle = await getSturdyOracle();
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [getParamPerNetwork(ReserveAssets, network).mooMIM_2CRV],
        [mooMIM2CRVOracleAddress]
      )
    );

    console.log(
      (
        await sturdyOracle.getAssetPrice(getParamPerNetwork(ReserveAssets, network).mooMIM_2CRV)
      ).toString()
    );

    console.log(`${CONTRACT_NAME}.address`, beefyMIM2CRVVault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
