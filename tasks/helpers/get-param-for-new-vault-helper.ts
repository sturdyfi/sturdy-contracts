import { task } from 'hardhat/config';
import { eContractid, eEthereumNetwork, eNetwork, PoolConfiguration } from '../../helpers/types';
import { getTreasuryAddress, loadPoolConfig } from '../../helpers/configuration';
import { getReserveConfigs } from '../../helpers/init-helpers';
import {
  getATokensAndRatesHelper,
  getCollateralATokenImpl,
  getGenericATokenImpl,
  getLendingPoolAddressesProvider,
  getStableDebtToken,
  getSturdyIncentivesController,
  getSturdyOracle,
  getVariableDebtToken,
} from '../../helpers/contracts-getters';
import { deployDefaultReserveInterestRateStrategy } from '../../helpers/contracts-deployments';
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
    const strategyParams = reserveConfigs['strategy' + symbol.toUpperCase()];
    const reserveAssetAddress = ReserveAssets[network][symbol];
    const addressProvider = await getLendingPoolAddressesProvider();
    const treasuryAddress = await getTreasuryAddress(poolConfig);
    const incentivesController = await getSturdyIncentivesController();
    const atokenAndRatesDeployer = await getATokensAndRatesHelper();

    // ToDo: Deploy yielddistributor parts instead parameter
    console.log('Yield Distributor Address: ', yielddistributor);
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
