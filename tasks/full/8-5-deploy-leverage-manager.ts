import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  getSturdyOracle,
  getLendingPoolAddressesProvider,
  getConvexFRAX3CRVVault,
  getConvexDAIUSDCUSDTSUSDVault,
  getConvexMIM3CRVVault,
  getConvexFRAXUSDCVault,
  getConvexIronBankVault,
  getConvexTUSDFRAXBPVault,
  getAuraBBAUSDVault,
  getAuraBBA3USDVault,
} from '../../helpers/contracts-getters';
import {
  deployLeverageSwapManager,
  deployFRAX3CRVLevSwap,
  deployDAIUSDCUSDTSUSDLevSwap,
  deployFRAXUSDCLevSwap,
  deployTUSDFRAXBPLevSwap,
  deployAURABBAUSDLevSwap,
  deployMIM3CRVLevSwap,
  deployAURABBA3USDLevSwap,
} from '../../helpers/contracts-deployments';
import { eNetwork, ISturdyConfiguration } from '../../helpers/types';
import { getParamPerNetwork } from '../../helpers/contracts-helpers';
import { waitForTx } from '../../helpers/misc-utils';

const CONTRACT_NAME = 'LeverageSwapManager';

task(`full:deploy-leverage-swap-manager`, `Deploys the ${CONTRACT_NAME} contract`)
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
      FRAX_3CRV_LP,
      DAI_USDC_USDT_SUSD_LP,
      FRAX_USDC_LP,
      IRON_BANK_LP,
      MIM_3CRV_LP,
      TUSD_FRAXBP_LP,
      BAL_BB_A_USD_LP,
      BAL_BB_A3_USD_LP,
      ReserveAssets,
      ChainlinkAggregator,
    } = poolConfig as ISturdyConfiguration;

    const sturdyOracle = await getSturdyOracle();

    const addressProvider = await getLendingPoolAddressesProvider();

    const leverageManager = await deployLeverageSwapManager(verify);

    // deploy & register FRAX3CRVLevSwap
    const fraxVault = await getConvexFRAX3CRVVault();
    const fraxLevSwap = await deployFRAX3CRVLevSwap(
      [getParamPerNetwork(FRAX_3CRV_LP, network), fraxVault.address, addressProvider.address],
      verify
    );

    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).cvxFRAX_3CRV,
      fraxLevSwap.address
    );
    console.log('FRAX3CRVLevSwap: %s', fraxLevSwap.address);

    // deploy & register DAIUSDCUSDTSUSDLevSwap
    const susdVault = await getConvexDAIUSDCUSDTSUSDVault();
    const susdLevSwap = await deployDAIUSDCUSDTSUSDLevSwap(
      [
        getParamPerNetwork(DAI_USDC_USDT_SUSD_LP, network),
        susdVault.address,
        addressProvider.address,
      ],
      verify
    );

    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).cvxDAI_USDC_USDT_SUSD,
      susdLevSwap.address
    );
    console.log('DAIUSDCUSDTSUSDLevSwap: %s', susdLevSwap.address);

    // deploy & register FRAXUSDCLevSwap
    const fraxusdcVault = await getConvexFRAXUSDCVault();
    const fraxusdcLevSwap = await deployFRAXUSDCLevSwap(
      [getParamPerNetwork(FRAX_USDC_LP, network), fraxusdcVault.address, addressProvider.address],
      verify
    );

    let [FRAXUSDCOracleAddress] = await sturdyOracle.getSourceOfAsset(
      getParamPerNetwork(ReserveAssets, network).cvxFRAX_USDC
    );
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [getParamPerNetwork(FRAX_USDC_LP, network)],
        [FRAXUSDCOracleAddress],
        [false]
      )
    );
    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).cvxFRAX_USDC,
      fraxusdcLevSwap.address
    );
    console.log('FRAXUSDCLevSwap: %s', fraxusdcLevSwap.address);

    // // deploy & register IRONBANKLevSwap
    // const ironbankVault = await getConvexIronBankVault();
    // const ironbankLevSwap = await deployIRONBANKLevSwap(
    //   [getParamPerNetwork(IRON_BANK_LP, network), ironbankVault.address, addressProvider.address],
    //   verify
    // );
    // let IronBankOracleAddress = await sturdyOracle.getSourceOfAsset(
    //   getParamPerNetwork(ReserveAssets, network).cvxIRON_BANK
    // );
    // await waitForTx(
    //   await sturdyOracle.setAssetSources(
    //     [getParamPerNetwork(IRON_BANK_LP, network)],
    //     [IronBankOracleAddress]
    //   )
    // );
    // await leverageManager.registerLevSwapper(
    //   getParamPerNetwork(ReserveAssets, network).cvxIRON_BANK,
    //   ironbankLevSwap.address
    // );
    // console.log('IRONBANKLevSwap: %s', ironbankLevSwap.address);

    // deploy & register MIM3CRVLevSwap
    const mim3crvVault = await getConvexMIM3CRVVault();
    const mim3crvLevSwap = await deployMIM3CRVLevSwap(
      [getParamPerNetwork(MIM_3CRV_LP, network), mim3crvVault.address, addressProvider.address],
      verify
    );
    let [MIM3CRVOracleAddress] = await sturdyOracle.getSourceOfAsset(
      getParamPerNetwork(ReserveAssets, network).cvxMIM_3CRV
    );
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [getParamPerNetwork(MIM_3CRV_LP, network)],
        [MIM3CRVOracleAddress],
        [false]
      )
    );
    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).cvxMIM_3CRV,
      mim3crvLevSwap.address
    );
    console.log('MIM3CRVLevSwap: %s', mim3crvLevSwap.address);

    // deploy & register TUSDFRAXBPLevSwap
    const tusdfraxbpVault = await getConvexTUSDFRAXBPVault();
    const tusdfraxbpLevSwap = await deployTUSDFRAXBPLevSwap(
      [
        getParamPerNetwork(TUSD_FRAXBP_LP, network),
        tusdfraxbpVault.address,
        addressProvider.address,
      ],
      verify
    );
    let [TUSDFRAXBPOracleAddress] = await sturdyOracle.getSourceOfAsset(
      getParamPerNetwork(ReserveAssets, network).cvxTUSD_FRAXBP
    );
    await waitForTx(
      await sturdyOracle.setAssetSources(
        [getParamPerNetwork(TUSD_FRAXBP_LP, network)],
        [TUSDFRAXBPOracleAddress],
        [false]
      )
    );
    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).cvxTUSD_FRAXBP,
      tusdfraxbpLevSwap.address
    );
    console.log('TUSDFRAXBPLevSwap: %s', tusdfraxbpLevSwap.address);

    // // deploy & register auraBBAUSDLevSwap
    // const aurabbausdVault = await getAuraBBAUSDVault();
    // const aurabbausdLevSwap = await deployAURABBAUSDLevSwap(
    //   [
    //     getParamPerNetwork(BAL_BB_A_USD_LP, network),
    //     aurabbausdVault.address,
    //     addressProvider.address,
    //   ],
    //   verify
    // );
    // await leverageManager.registerLevSwapper(
    //   getParamPerNetwork(ReserveAssets, network).auraBB_A_USD,
    //   aurabbausdLevSwap.address
    // );
    // console.log('AURABBAUSDLevSwap: %s', aurabbausdLevSwap.address);

    // deploy & register auraBBA3USDLevSwap
    const aurabba3usdVault = await getAuraBBA3USDVault();
    const aurabba3usdLevSwap = await deployAURABBA3USDLevSwap(
      [
        getParamPerNetwork(BAL_BB_A3_USD_LP, network),
        aurabba3usdVault.address,
        addressProvider.address,
      ],
      verify
    );
    await leverageManager.registerLevSwapper(
      getParamPerNetwork(ReserveAssets, network).auraBB_A3_USD,
      aurabba3usdLevSwap.address
    );
    console.log('AURABBA3USDLevSwap: %s', aurabba3usdLevSwap.address);

    console.log(`${CONTRACT_NAME}.address`, leverageManager.address);
    console.log(`\tFinished ${CONTRACT_NAME} deployment`);
  });
