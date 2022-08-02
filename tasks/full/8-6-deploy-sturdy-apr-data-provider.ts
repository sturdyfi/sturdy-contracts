import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import { deploySturdyAPRDataProvider } from '../../helpers/contracts-deployments';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';

const CONTRACT_NAME = 'SturdyAPRDataProvider';

task(`full:deploy-sturdy-apr-data-provider`, `Deploys the ${CONTRACT_NAME} contract`)
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .addFlag('verify', `Verify ${CONTRACT_NAME} contract via Etherscan API.`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }
    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>localBRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveAssets } = poolConfig as ISturdyConfiguration;

    const aprProvider = await deploySturdyAPRDataProvider(verify);

    //FRAX_3CRV
    await aprProvider.registerConvexReserve(
      getParamPerNetwork(ReserveAssets, network).cvxFRAX_3CRV,
      32,
      '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B' //convex LP pool address
    );
    //MIM_3CRV
    await aprProvider.registerConvexReserve(
      getParamPerNetwork(ReserveAssets, network).cvxMIM_3CRV,
      40,
      '0x5a6A4D54456819380173272A5E8E9B9904BdF41B' //convex LP pool address
    );
    //DAI_USDC_USDT_SUSD
    await aprProvider.registerConvexReserve(
      getParamPerNetwork(ReserveAssets, network).cvxDAI_USDC_USDT_SUSD,
      4,
      '0xA5407eAE9Ba41422680e2e00537571bcC53efBfD' //convex LP pool address
    );
    //IRON_BANK
    await aprProvider.registerConvexReserve(
      getParamPerNetwork(ReserveAssets, network).cvxIRON_BANK,
      29,
      '0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF' //convex LP pool address
    );
    //FRAX_USDC
    await aprProvider.registerConvexReserve(
      getParamPerNetwork(ReserveAssets, network).cvxFRAX_USDC,
      100,
      '0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2' //convex LP pool address
    );

    console.log('APR: ', (await aprProvider.APR()).toString());

    console.log(`${CONTRACT_NAME}.address`, aprProvider.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
