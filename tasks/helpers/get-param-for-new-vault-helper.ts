import { task } from 'hardhat/config';
import {
  eContractid,
  eEthereumNetwork,
  eNetwork,
  IFantomConfiguration,
  ISturdyConfiguration,
  PoolConfiguration,
} from '../../helpers/types';
import { getTreasuryAddress, loadPoolConfig } from '../../helpers/configuration';
import { getReserveConfigs } from '../../helpers/init-helpers';
import {
  getATokensAndRatesHelper,
  getCollateralATokenImpl,
  getGenericATokenImpl,
  getLendingPoolAddressesProvider,
  getPriceOracle,
  getStableDebtToken,
  getSturdyIncentivesController,
  getSturdyOracle,
  getVariableDebtToken,
} from '../../helpers/contracts-getters';
import {
  deployAuraBBA3USDVault,
  deployAuraBBA3USDVaultImpl,
  deployBasedMiMaticBeefyVaultImpl,
  deployBasedMiMaticLPOracle,
  deployBasedOracle,
  deployConvexDAIUSDCUSDTSUSDVaultImpl,
  deployConvexFRAXUSDCVaultImpl,
  deployConvexIronBankVaultImpl,
  deployConvexMIM3CRVVaultImpl,
  deployConvexTUSDFRAXBPVaultImpl,
  deployDefaultReserveInterestRateStrategy,
  deployMIM3CRVOracle,
  deployTombMiMaticBeefyVaultImpl,
  deployTombMiMaticLPOracle,
  deployYearnCRVVaultImpl,
  deployYearnSPELLVaultImpl,
} from '../../helpers/contracts-deployments';
import { impersonateAccountsHardhat, setDRE, waitForTx } from '../../helpers/misc-utils';
import { ZERO_ADDRESS } from '../../helpers/constants';
import { getParamPerNetwork, rawInsertContractAddressInDb } from '../../helpers/contracts-helpers';

const isSymbolValid = (
  symbol: string,
  network: eEthereumNetwork,
  poolConfig: PoolConfiguration,
  reserveConfigs: any
) =>
  Object.keys(reserveConfigs).includes('strategy' + symbol.toUpperCase()) &&
  poolConfig.ReserveAssets[network][symbol] &&
  poolConfig.ReservesConfig[symbol] === reserveConfigs['strategy' + symbol.toUpperCase()];

// hardhat external:get-param-for-new-vault --pool Fantom --symbol mooTOMB_MIMATIC --network ftm/ftm_test
task('external:get-param-for-new-vault', 'Deploy A token, Debt Tokens, Risk Parameters')
  .addParam('pool', `Pool name to retrieve configuration`)
  .addParam('symbol', `Asset symbol, needs to have configuration ready`)
  .addParam('yielddistributor', `Yield Distribution address`, ZERO_ADDRESS)
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ pool, verify, symbol, yielddistributor }, localBRE) => {
    const poolConfig = loadPoolConfig(pool);
    const reserveConfigs = getReserveConfigs(pool);
    const network = process.env.FORK || localBRE.network.name;
    if (!isSymbolValid(symbol, network as eEthereumNetwork, poolConfig, reserveConfigs)) {
      throw new Error(
        `
WRONG RESERVE ASSET SETUP:
        The symbol ${symbol} has no reserve Config and/or reserve Asset setup.
        update /markets/${pool}/index.ts and add the asset address for ${network} network
        update /markets/${pool}/reservesConfigs.ts and add parameters for ${symbol}
        `
      );
    }
    setDRE(localBRE);
    const {
      ATokenNamePrefix,
      SymbolPrefix,
      StableDebtTokenNamePrefix,
      VariableDebtTokenNamePrefix,
      ReserveFactorTreasuryAddress,
      ReserveAssets,
      ChainlinkAggregator,
    } = poolConfig;
    const config: IFantomConfiguration = poolConfig as IFantomConfiguration;
    const strategyParams = reserveConfigs['strategy' + symbol.toUpperCase()];
    const reserveAssetAddress = ReserveAssets[network][symbol];
    const addressProvider = await getLendingPoolAddressesProvider();
    const treasuryAddress = await getTreasuryAddress(poolConfig);
    const incentivesController = await getSturdyIncentivesController();
    const atokenAndRatesDeployer = await getATokensAndRatesHelper();

    // ToDo: Deploy yielddistributor parts instead parameter
    console.log('Yield Distributor Address: ', yielddistributor);
    // const rates = { address: ZERO_ADDRESS };
    const rates = await deployDefaultReserveInterestRateStrategy(
      [
        addressProvider.address,
        strategyParams.strategy.optimalUtilizationRate,
        strategyParams.strategy.baseVariableBorrowRate,
        strategyParams.strategy.variableRateSlope1,
        strategyParams.strategy.variableRateSlope2,
        strategyParams.strategy.stableRateSlope1,
        strategyParams.strategy.stableRateSlope2,
        strategyParams.strategy.capacity,
      ],
      verify
    );
    rawInsertContractAddressInDb(strategyParams.strategy.name, rates.address);

    let aTokenToUse: string;

    if (strategyParams.aTokenImpl === eContractid.AToken) {
      aTokenToUse = (await getGenericATokenImpl()).address;
    } else {
      aTokenToUse = (await getCollateralATokenImpl()).address;
    }

    // ========== Fantom Vault ===========
    // // mooTOMB_MIMATIC reserve
    // {
    //   // Deploy vault impl
    //   const impladdress = (await deployTombMiMaticBeefyVaultImpl()).address;

    //   // Deploy and Register new oracle for new vault
    //   if (network === 'ftm_test') {
    //     const priceOracleInstance = await getPriceOracle();
    //     await waitForTx(
    //       await priceOracleInstance.setAssetPrice(
    //         config.MIMATIC[network],
    //         config.Mocks.AllAssetsInitialPrices['MIMATIC']
    //       )
    //     );
    //     await waitForTx(
    //       await priceOracleInstance.setAssetPrice(
    //         config.ReserveAssets[network]['mooTOMB_MIMATIC'],
    //         config.Mocks.AllAssetsInitialPrices['mooTOMB_MIMATIC']
    //       )
    //     );
    //   } else {
    //     let mooTombMiMaticOracleAddress = getParamPerNetwork(
    //       ChainlinkAggregator,
    //       <eNetwork>network
    //     ).mooTOMB_MIMATIC;
    //     if (!mooTombMiMaticOracleAddress) {
    //       const mooTombMiMaticOracle = await deployTombMiMaticLPOracle();
    //       mooTombMiMaticOracleAddress = mooTombMiMaticOracle.address;
    //     }
    //     const sturdyOracle = await getSturdyOracle();
    //     await waitForTx(
    //       await sturdyOracle
    //         .setAssetSources(
    //           [
    //             getParamPerNetwork(config.MIMATIC, <eNetwork>network),
    //             getParamPerNetwork(ReserveAssets, <eNetwork>network).mooTOMB_MIMATIC,
    //           ],
    //           [
    //             getParamPerNetwork(ChainlinkAggregator, <eNetwork>network).MIMATIC,
    //             mooTombMiMaticOracleAddress,
    //           ]
    //         )
    //     );
    //   }
    //   console.log('_ids: ', [
    //     localBRE.ethers.utils.formatBytes32String('BEEFY_TOMB_MIMATIC_VAULT').toString(), //implement id
    //     localBRE.ethers.utils.formatBytes32String('mooTombTOMB-MIMATIC').toString(), //internal asset id
    //     localBRE.ethers.utils.formatBytes32String('TOMB_MIMATIC_LP').toString(), //external asset id
    //     //etc...
    //     localBRE.ethers.utils.formatBytes32String('MIMATIC').toString(),
    //     localBRE.ethers.utils.formatBytes32String('USDC').toString(),
    //     localBRE.ethers.utils.formatBytes32String('tombSwapRouter').toString(),
    //   ]);
    //   console.log('_addresses: ', [
    //     impladdress, //implement address
    //     getParamPerNetwork(config.BeefyVaultTOMB_MIMATIC, <eNetwork>network), //internal asset
    //     getParamPerNetwork(config.TOMB_MIMATIC_LP, <eNetwork>network), //exterenal asset
    //     //etc...
    //     getParamPerNetwork(config.MIMATIC, <eNetwork>network),
    //     getParamPerNetwork(config.ReserveAssets, <eNetwork>network).USDC,
    //     getParamPerNetwork(config.TombSwapRouter, <eNetwork>network),
    //   ]);
    // }

    // // mooBASED_MIMATIC reserve
    // {
    //   // Deploy vault impl
    //   const impladdress = (await deployBasedMiMaticBeefyVaultImpl(verify)).address;

    //   // Deploy and Register new oracle for new vault
    //   if (network === 'ftm_test') {
    //     const priceOracleInstance = await getPriceOracle();
    //     await waitForTx(
    //       await priceOracleInstance.setAssetPrice(
    //         config.BASED[network],
    //         config.Mocks.AllAssetsInitialPrices['BASED']
    //       )
    //     );
    //     await waitForTx(
    //       await priceOracleInstance.setAssetPrice(
    //         config.ReserveAssets[network]['mooBASED_MIMATIC'],
    //         config.Mocks.AllAssetsInitialPrices['mooBASED_MIMATIC']
    //       )
    //     );
    //   } else {
    //     let basedOracleAddress = getParamPerNetwork(ChainlinkAggregator, <eNetwork>network).BASED;
    //     if (!basedOracleAddress) {
    //       const basedOracle = await deployBasedOracle(verify);
    //       basedOracleAddress = basedOracle.address;
    //     }
    //     let mooBasedMiMaticOracleAddress = getParamPerNetwork(
    //       ChainlinkAggregator,
    //       <eNetwork>network
    //     ).mooBASED_MIMATIC;
    //     if (!mooBasedMiMaticOracleAddress) {
    //       const mooBasedMiMaticOracle = await deployBasedMiMaticLPOracle(verify);
    //       mooBasedMiMaticOracleAddress = mooBasedMiMaticOracle.address;
    //     }
    //     const sturdyOracle = await getSturdyOracle();
    //     await waitForTx(
    //       await sturdyOracle
    //         .setAssetSources(
    //           [
    //             getParamPerNetwork(config.BASED, <eNetwork>network),
    //             getParamPerNetwork(ReserveAssets, <eNetwork>network).mooBASED_MIMATIC,
    //           ],
    //           [basedOracleAddress, mooBasedMiMaticOracleAddress]
    //         )
    //     );
    //   }
    //   console.log('_ids: ', [
    //     localBRE.ethers.utils.formatBytes32String('BEEFY_BASED_MIMATIC_VAULT').toString(), //implement id
    //     localBRE.ethers.utils.formatBytes32String('mooTombBASED-MIMATIC').toString(), //internal asset id
    //     localBRE.ethers.utils.formatBytes32String('BASED_MIMATIC_LP').toString(), //external asset id
    //     //etc...
    //     localBRE.ethers.utils.formatBytes32String('BASED').toString(),
    //   ]);
    //   console.log('_addresses: ', [
    //     impladdress, //implement address
    //     getParamPerNetwork(config.BeefyVaultBASED_MIMATIC, <eNetwork>network), //internal asset
    //     getParamPerNetwork(config.BASED_MIMATIC_LP, <eNetwork>network), //exterenal asset
    //     //etc...
    //     getParamPerNetwork(config.BASED, <eNetwork>network),
    //   ]);
    // }

    // // yvSPELL reserve
    // {
    //   // Deploy vault impl
    //   const impladdress = (await deployYearnSPELLVaultImpl(verify)).address;

    //   // Deploy and Register new oracle for new vault
    //   if (network === 'ftm_test') {
    //     const priceOracleInstance = await getPriceOracle();
    //     await waitForTx(
    //       await priceOracleInstance.setAssetPrice(
    //         config.ReserveAssets[network]['yvSPELL'],
    //         config.Mocks.AllAssetsInitialPrices['yvSPELL']
    //       )
    //     );
    //   } else {
    //     const sturdyOracle = await getSturdyOracle();
    //     await waitForTx(
    //       await sturdyOracle.setAssetSources(
    //         [getParamPerNetwork(ReserveAssets, <eNetwork>network).yvSPELL],
    //         [getParamPerNetwork(ChainlinkAggregator, <eNetwork>network).yvSPELL]
    //       )
    //     );
    //   }
    //   console.log('_ids: ', [
    //     localBRE.ethers.utils.formatBytes32String('YEARN_SPELL_VAULT').toString(), //implement id
    //     localBRE.ethers.utils.formatBytes32String('YVSPELL').toString(), //internal asset id
    //     localBRE.ethers.utils.formatBytes32String('SPELL').toString(), //external asset id
    //     //etc...
    //   ]);
    //   console.log('_addresses: ', [
    //     impladdress, //implement address
    //     getParamPerNetwork(config.YearnSPELLVaultFTM, <eNetwork>network), //internal asset
    //     getParamPerNetwork(config.SPELL, <eNetwork>network), //exterenal asset
    //     //etc...
    //   ]);
    // }

    // // yvCRV reserve
    // {
    //   // Deploy vault impl
    //   const impladdress = (await deployYearnCRVVaultImpl(verify)).address;

    //   // Deploy and Register new oracle for new vault
    //   if (network === 'ftm_test') {
    //     const priceOracleInstance = await getPriceOracle();
    //     await waitForTx(
    //       await priceOracleInstance.setAssetPrice(
    //         config.ReserveAssets[network]['yvCRV'],
    //         config.Mocks.AllAssetsInitialPrices['yvCRV']
    //       )
    //     );
    //   } else {
    //     const sturdyOracle = await getSturdyOracle();
    //     await waitForTx(
    //       await sturdyOracle.setAssetSources(
    //         [getParamPerNetwork(ReserveAssets, <eNetwork>network).yvCRV],
    //         [getParamPerNetwork(ChainlinkAggregator, <eNetwork>network).yvCRV]
    //       )
    //     );
    //   }
    //   console.log('_ids: ', [
    //     localBRE.ethers.utils.formatBytes32String('YEARN_CRV_VAULT').toString(), //implement id
    //     localBRE.ethers.utils.formatBytes32String('YVCRV').toString(), //internal asset id
    //     localBRE.ethers.utils.formatBytes32String('CRV').toString(), //external asset id
    //     //etc...
    //   ]);
    //   console.log('_addresses: ', [
    //     impladdress, //implement address
    //     getParamPerNetwork(config.YearnCRVVaultFTM, <eNetwork>network), //internal asset
    //     getParamPerNetwork(config.CRV, <eNetwork>network), //exterenal asset
    //     //etc...
    //   ]);
    // }

    // ========== Ethereum Vault ===========
    // // cvxMIM_3CRV reserve
    // {
    //   // Deploy vault impl
    //   const vaultImpl = await deployConvexMIM3CRVVaultImpl(verify);
    //   const addressesProvider = await getLendingPoolAddressesProvider();
    //   await waitForTx(await vaultImpl.initialize(addressesProvider.address));

    //   console.log('_ids: ', [
    //     localBRE.ethers.utils.formatBytes32String('CONVEX_MIM_3CRV_VAULT').toString(), //implement id
    //     localBRE.ethers.utils.formatBytes32String('CVXFRAX_3CRV').toString(), //internal asset id
    //     localBRE.ethers.utils.formatBytes32String('MIM_3CRV_LP').toString(), //external asset id
    //     //etc...
    //   ]);
    //   console.log('_addresses: ', [
    //     vaultImpl.address, //implement address
    //     getParamPerNetwork(ReserveAssets, <eNetwork>network).cvxMIM_3CRV, //internal asset
    //     getParamPerNetwork((poolConfig as ISturdyConfiguration).MIM_3CRV_LP, <eNetwork>network), //exterenal asset
    //     //etc...
    //   ]);
    // }

    // // cvxDAI_USDC_USDT_SUSD reserve
    // {
    //   // Deploy vault impl
    //   const vaultImpl = await deployConvexDAIUSDCUSDTSUSDVaultImpl(verify);
    //   const addressesProvider = await getLendingPoolAddressesProvider();
    //   await waitForTx(await vaultImpl.initialize(addressesProvider.address));

    //   console.log('_ids: ', [
    //     localBRE.ethers.utils.formatBytes32String('CONVEX_DAI_USDC_USDT_SUSD_VAULT').toString(), //implement id
    //     localBRE.ethers.utils.formatBytes32String('CVXDAI_USDC_USDT_SUSD').toString(), //internal asset id
    //     localBRE.ethers.utils.formatBytes32String('DAI_USDC_USDT_SUSD_LP').toString(), //external asset id
    //     //etc...
    //   ]);
    //   console.log('_addresses: ', [
    //     vaultImpl.address, //implement address
    //     getParamPerNetwork(ReserveAssets, <eNetwork>network).cvxDAI_USDC_USDT_SUSD, //internal asset
    //     getParamPerNetwork(
    //       (poolConfig as ISturdyConfiguration).DAI_USDC_USDT_SUSD_LP,
    //       <eNetwork>network
    //     ), //exterenal asset
    //     //etc...
    //   ]);
    // }

    // // cvxIRON_BANK reserve
    // {
    //   // Deploy vault impl
    //   const vaultImpl = await deployConvexIronBankVaultImpl(verify);
    //   const addressesProvider = await getLendingPoolAddressesProvider();
    //   await waitForTx(await vaultImpl.initialize(addressesProvider.address));

    //   console.log('_ids: ', [
    //     localBRE.ethers.utils.formatBytes32String('CONVEX_IRON_BANK_VAULT').toString(), //implement id
    //     localBRE.ethers.utils.formatBytes32String('CVXIRON_BANK').toString(), //internal asset id
    //     localBRE.ethers.utils.formatBytes32String('IRON_BANK_LP').toString(), //external asset id
    //     //etc...
    //   ]);
    //   console.log('_addresses: ', [
    //     vaultImpl.address, //implement address
    //     getParamPerNetwork(ReserveAssets, <eNetwork>network).cvxIRON_BANK, //internal asset
    //     getParamPerNetwork((poolConfig as ISturdyConfiguration).IRON_BANK_LP, <eNetwork>network), //exterenal asset
    //     //etc...
    //   ]);
    // }

    // // cvxFRAX_USDC reserve
    // {
    //   // Deploy vault impl
    //   const vaultImpl = await deployConvexFRAXUSDCVaultImpl(verify);
    //   const addressesProvider = await getLendingPoolAddressesProvider();
    //   await waitForTx(await vaultImpl.initialize(addressesProvider.address));

    //   console.log('_ids: ', [
    //     localBRE.ethers.utils.formatBytes32String('CONVEX_FRAX_USDC_VAULT').toString(), //implement id
    //     localBRE.ethers.utils.formatBytes32String('CVXFRAX_USDC').toString(), //internal asset id
    //     localBRE.ethers.utils.formatBytes32String('FRAX_USDC_LP').toString(), //external asset id
    //     //etc...
    //   ]);
    //   console.log('_addresses: ', [
    //     vaultImpl.address, //implement address
    //     getParamPerNetwork(ReserveAssets, <eNetwork>network).cvxFRAX_USDC, //internal asset
    //     getParamPerNetwork((poolConfig as ISturdyConfiguration).FRAX_USDC_LP, <eNetwork>network), //exterenal asset
    //     //etc...
    //   ]);
    // }

    // // cvxTUSD_FRAXBP reserve
    // {
    //   // Deploy vault impl
    //   const vaultImpl = await deployConvexTUSDFRAXBPVaultImpl(verify);
    //   const addressesProvider = await getLendingPoolAddressesProvider();
    //   await waitForTx(await vaultImpl.initialize(addressesProvider.address));

    //   console.log('_ids: ', [
    //     localBRE.ethers.utils.formatBytes32String('CONVEX_TUSD_FRAXBP_VAULT').toString(), //implement id
    //     localBRE.ethers.utils.formatBytes32String('CVXTUSD_FRAXBP').toString(), //internal asset id
    //     localBRE.ethers.utils.formatBytes32String('TUSD_FRAXBP_LP').toString(), //external asset id
    //     //etc...
    //   ]);
    //   console.log('_addresses: ', [
    //     vaultImpl.address, //implement address
    //     getParamPerNetwork(ReserveAssets, <eNetwork>network).cvxTUSD_FRAXBP, //internal asset
    //     getParamPerNetwork((poolConfig as ISturdyConfiguration).TUSD_FRAXBP_LP, <eNetwork>network), //exterenal asset
    //     //etc...
    //   ]);
    // }

    // auraBB_A3_USD reserve
    {
      // Deploy vault impl
      const vaultImpl = await deployAuraBBA3USDVaultImpl(verify);
      const addressesProvider = await getLendingPoolAddressesProvider();
      await waitForTx(await vaultImpl.initialize(addressesProvider.address));

      console.log('_ids: ', [
        localBRE.ethers.utils.formatBytes32String('AURA_BB_A3_USD_VAULT').toString(), //implement id
        localBRE.ethers.utils.formatBytes32String('AURABAL_BB_A3_USD').toString(), //internal asset id
        localBRE.ethers.utils.formatBytes32String('BAL_BB_A3_USD_LP').toString(), //external asset id
        //etc...
      ]);
      console.log('_addresses: ', [
        vaultImpl.address, //implement address
        getParamPerNetwork(ReserveAssets, <eNetwork>network).auraBB_A3_USD, //internal asset
        getParamPerNetwork(
          (poolConfig as ISturdyConfiguration).BAL_BB_A3_USD_LP,
          <eNetwork>network
        ), //exterenal asset
        //etc...
      ]);
    }

    console.log('_treasuryAddress: ', ReserveFactorTreasuryAddress[network]);
    console.log('_treasuryFee: ', '1000');
    console.log('_aTokenHelper: ', atokenAndRatesDeployer.address);
    console.log('_inputParams: ', [
      {
        asset: reserveAssetAddress,
        baseLTV: strategyParams.baseLTVAsCollateral,
        liquidationThreshold: strategyParams.liquidationThreshold,
        liquidationBonus: strategyParams.liquidationBonus,
        reserveFactor: strategyParams.reserveFactor,
        stableBorrowingEnabled: strategyParams.stableBorrowRateEnabled,
        borrowingEnabled: strategyParams.borrowingEnabled,
        collateralEnabled: strategyParams.collateralEnabled,
      },
    ]);

    console.log('_input: ', [
      {
        aTokenImpl: aTokenToUse,
        stableDebtTokenImpl: (await getStableDebtToken()).address,
        variableDebtTokenImpl: (await getVariableDebtToken()).address,
        underlyingAssetDecimals: strategyParams.reserveDecimals,
        interestRateStrategyAddress: rates.address,
        yieldAddress: ZERO_ADDRESS,
        underlyingAsset: reserveAssetAddress,
        treasury: treasuryAddress,
        incentivesController: incentivesController.address,
        underlyingAssetName: symbol,
        aTokenName: `${ATokenNamePrefix} ${symbol}`,
        aTokenSymbol: `s${SymbolPrefix}${symbol}`,
        variableDebtTokenName: `${VariableDebtTokenNamePrefix} ${SymbolPrefix}${symbol}`,
        variableDebtTokenSymbol: `variableDebt${SymbolPrefix}${symbol}`,
        stableDebtTokenName: `${StableDebtTokenNamePrefix} ${symbol}`,
        stableDebtTokenSymbol: `stableDebt${SymbolPrefix}${symbol}`,
        params: '0x10',
      },
    ]);
  });
