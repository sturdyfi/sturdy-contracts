import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  deployAuraBBAUSDVault,
  deployAURAOracle,
  deployBALBBAUSDOracle,
} from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy, getSturdyOracle } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'AuraBBAUSDVault';

task(`full:deploy-aura-bb-a-usd-vault`, `Deploys the ${CONTRACT_NAME} contract`)
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
    const {
      ReserveAssets,
      ReserveFactorTreasuryAddress,
      ChainlinkAggregator,
      BAL_BB_A_USD_LP,
      BAL,
      AURA,
    } = poolConfig as ISturdyConfiguration;
    const treasuryAddress = getParamPerNetwork(ReserveFactorTreasuryAddress, network);

    const vault = await deployAuraBBAUSDVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(vault.address);
    await vault.setTreasuryInfo(treasuryAddress, '1000'); //10% fee
    await vault.setConfiguration(getParamPerNetwork(BAL_BB_A_USD_LP, network), 2); // set balancer lp token & aura pool id
    await vault.setIncentiveRatio('7500');

    const internalAssetAddress = await vault.getInternalAsset();
    ReserveAssets[network].auraBB_A_USD = internalAssetAddress;
    console.log(`internal token: ${internalAssetAddress}`);

    // Deploy BALBBAUSD oracle
    let BALBBAUSDOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).auraBB_A_USD;
    if (!BALBBAUSDOracleAddress) {
      const BALBBAUSDOracle = await deployBALBBAUSDOracle(verify);
      BALBBAUSDOracleAddress = BALBBAUSDOracle.address;
    }

    // Deploy AURAOracle oracle
    let AURAOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).AURA;
    if (!AURAOracleAddress) {
      const AURAOracle = await deployAURAOracle(verify);
      AURAOracleAddress = AURAOracle.address;
    }

    // Register
    const sturdyOracle = await getSturdyOracle();
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [
          internalAssetAddress,
          getParamPerNetwork(BAL_BB_A_USD_LP, network),
          getParamPerNetwork(BAL, network),
          getParamPerNetwork(AURA, network),
        ],
        [
          BALBBAUSDOracleAddress,
          BALBBAUSDOracleAddress,
          getParamPerNetwork(ChainlinkAggregator, network).BAL,
          AURAOracleAddress,
        ],
        [false, false, false, false]
      )
    );
    console.log((await sturdyOracle.getAssetPrice(internalAssetAddress)).toString());

    console.log(`${CONTRACT_NAME}.address`, vault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
