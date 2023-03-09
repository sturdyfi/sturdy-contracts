import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  deployAuraRETHWETHVault,
  deployBALRETHWETHOracle,
} from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy, getSturdyOracle } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, IEthConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'AuraRETHWETHVault';

task(`full:eth:deploy-aura-reth-weth-vault`, `Deploys the ${CONTRACT_NAME} contract`)
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
    const { ReserveAssets, ReserveFactorTreasuryAddress, ChainlinkAggregator, BAL_RETH_WETH_LP } =
      poolConfig as IEthConfiguration;
    const treasuryAddress = getParamPerNetwork(ReserveFactorTreasuryAddress, network);

    const vault = await deployAuraRETHWETHVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(vault.address);
    await vault.setTreasuryInfo(treasuryAddress, '1000'); //10% fee
    await vault.setConfiguration(getParamPerNetwork(BAL_RETH_WETH_LP, network), 15); // set balancer lp token & aura pool id
    await vault.setIncentiveRatio('7500');

    const internalAssetAddress = await vault.getInternalAsset();
    ReserveAssets[network].auraRETH_WETH = internalAssetAddress;
    console.log(`internal token: ${internalAssetAddress}`);

    // Deploy BALRETHWETHOracle oracle
    let BALRETHWETHOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).auraRETH_WETH;
    if (!BALRETHWETHOracleAddress) {
      const BALRETHWETHOracle = await deployBALRETHWETHOracle(verify);
      BALRETHWETHOracleAddress = BALRETHWETHOracle.address;
    }

    // Register
    const sturdyOracle = await getSturdyOracle();
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [internalAssetAddress, getParamPerNetwork(BAL_RETH_WETH_LP, network)],
        [BALRETHWETHOracleAddress, BALRETHWETHOracleAddress],
        [true, false]
      )
    );
    console.log((await sturdyOracle.getAssetPrice(internalAssetAddress)).toString());

    console.log(`${CONTRACT_NAME}.address`, vault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
