import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  deployConvexETHSTETHVault,
  deployETHSTETHOracle,
} from '../../helpers/contracts-deployments';
import { getLendingPoolConfiguratorProxy, getSturdyOracle } from '../../helpers/contracts-getters';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';
import { eNetwork, IEthConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'ConvexETHSTETHVault';

task(`full:eth:deploy-convex-eth-steth-vault`, `Deploys the ${CONTRACT_NAME} contract`)
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
      ETH_STETH_LP,
      CRV,
      CVX,
    } = poolConfig as IEthConfiguration;
    const treasuryAddress = getParamPerNetwork(ReserveFactorTreasuryAddress, network);

    const vault = await deployConvexETHSTETHVault(verify);
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator.registerVault(vault.address);
    await vault.setTreasuryInfo(treasuryAddress, '1000'); //10% fee
    await vault.setConfiguration(getParamPerNetwork(ETH_STETH_LP, network), 25); // set curve lp token & convex pool id
    await vault.setIncentiveRatio('7500');

    const internalAssetAddress = await vault.getInternalAsset();
    ReserveAssets[network].cvxETH_STETH = internalAssetAddress;
    console.log(`internal token: ${internalAssetAddress}`);

    // Deploy ETHSTETHOracle oracle
    let ETHSTETHOracleAddress = getParamPerNetwork(ChainlinkAggregator, network).cvxETH_STETH;
    if (!ETHSTETHOracleAddress) {
      const ETHSTETHOracle = await deployETHSTETHOracle(verify);
      ETHSTETHOracleAddress = ETHSTETHOracle.address;
    }

    // Register
    const sturdyOracle = await getSturdyOracle();
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [
          internalAssetAddress,
          getParamPerNetwork(ETH_STETH_LP, network),
          getParamPerNetwork(CRV, network),
          getParamPerNetwork(CVX, network),
        ],
        [
          ETHSTETHOracleAddress,
          ETHSTETHOracleAddress,
          getParamPerNetwork(ChainlinkAggregator, network).CRV,
          getParamPerNetwork(ChainlinkAggregator, network).CVX,
        ],
        [true, false, false, false]
      )
    );
    console.log((await sturdyOracle.getAssetPrice(internalAssetAddress)).toString());

    console.log(`${CONTRACT_NAME}.address`, vault.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
