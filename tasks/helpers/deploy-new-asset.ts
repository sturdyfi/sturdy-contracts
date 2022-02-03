import { task } from 'hardhat/config';
import {
  eContractid,
  eEthereumNetwork,
  eNetwork,
  iAssetBase,
  PoolConfiguration,
} from '../../helpers/types';
import { getTreasuryAddress, loadPoolConfig } from '../../helpers/configuration';
import { getReserveConfigs } from '../../helpers/init-helpers';
import {
  getCollateralATokenImpl,
  getGenericATokenImpl,
  getLendingPool,
  getLendingPoolAddressesProvider,
  getLendingPoolConfiguratorProxy,
  getPriceOracle,
  getStableDebtToken,
  getSturdyIncentivesController,
  getVariableDebtToken,
  getYearnWETHVault,
} from './../../helpers/contracts-getters';
import { deployDefaultReserveInterestRateStrategy } from './../../helpers/contracts-deployments';
import { setDRE, waitForTx } from '../../helpers/misc-utils';
import { ZERO_ADDRESS } from './../../helpers/constants';
import { rawInsertContractAddressInDb } from '../../helpers/contracts-helpers';

const isSymbolValid = (
  symbol: string,
  network: eEthereumNetwork,
  poolConfig: PoolConfiguration,
  reserveConfigs: any
) =>
  Object.keys(reserveConfigs).includes('strategy' + symbol.toUpperCase()) &&
  poolConfig.ReserveAssets[network][symbol] &&
  poolConfig.ReservesConfig[symbol] === reserveConfigs['strategy' + symbol.toUpperCase()];

task('external:deploy-new-asset', 'Deploy A token, Debt Tokens, Risk Parameters')
  .addParam('pool', `Pool name to retrieve configuration`)
  .addParam('symbol', `Asset symbol, needs to have configuration ready`)
  .addParam('yieldaddress', `Yield address, needs for collateral asset`)
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ pool, verify, symbol, yieldaddress }, localBRE) => {
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
      Mocks: { AllAssetsInitialPrices },
      ATokenNamePrefix,
      SymbolPrefix,
      StableDebtTokenNamePrefix,
      VariableDebtTokenNamePrefix,
    } = poolConfig;
    const strategyParams = reserveConfigs['strategy' + symbol.toUpperCase()];
    const reserveAssetAddress = poolConfig.ReserveAssets[network][symbol];
    const addressProvider = await getLendingPoolAddressesProvider();
    const lendingPool = await getLendingPool();
    const treasuryAddress = await getTreasuryAddress(poolConfig);
    const incentivesController = await getSturdyIncentivesController();
    const rates = await deployDefaultReserveInterestRateStrategy(
      [
        addressProvider.address,
        strategyParams.strategy.optimalUtilizationRate,
        strategyParams.strategy.baseVariableBorrowRate,
        strategyParams.strategy.variableRateSlope1,
        strategyParams.strategy.variableRateSlope2,
        strategyParams.strategy.stableRateSlope1,
        strategyParams.strategy.stableRateSlope2,
      ],
      verify
    );
    rawInsertContractAddressInDb(strategyParams.strategy.name, rates.address);

    const configurator = await getLendingPoolConfiguratorProxy();
    let aTokenToUse: string;

    if (strategyParams.aTokenImpl === eContractid.AToken) {
      aTokenToUse = (await getGenericATokenImpl()).address;
    } else {
      aTokenToUse = (await getCollateralATokenImpl()).address;
    }

    await waitForTx(
      await configurator.batchInitReserve([
        {
          aTokenImpl: aTokenToUse,
          stableDebtTokenImpl: (await getStableDebtToken()).address,
          variableDebtTokenImpl: (await getVariableDebtToken()).address,
          underlyingAssetDecimals: strategyParams.reserveDecimals,
          interestRateStrategyAddress: rates.address,
          yieldAddress: yieldaddress || ZERO_ADDRESS,
          underlyingAsset: reserveAssetAddress,
          treasury: treasuryAddress,
          incentivesController: incentivesController.address,
          underlyingAssetName: symbol,
          aTokenName: `${ATokenNamePrefix} ${symbol}`,
          aTokenSymbol: `a${SymbolPrefix}${symbol}`,
          variableDebtTokenName: `${VariableDebtTokenNamePrefix} ${SymbolPrefix}${symbol}`,
          variableDebtTokenSymbol: `variableDebt${SymbolPrefix}${symbol}`,
          stableDebtTokenName: `${StableDebtTokenNamePrefix} ${symbol}`,
          stableDebtTokenSymbol: `stableDebt${SymbolPrefix}${symbol}`,
          params: '0x10',
        },
      ])
    );

    const response = await lendingPool.getReserveData(reserveAssetAddress);

    await incentivesController.configureAssets(
      [response.aTokenAddress, response.variableDebtTokenAddress],
      [strategyParams.emissionPerSecond, strategyParams.emissionPerSecond]
    );

    // set asset price
    const priceOracleInstance = await getPriceOracle();
    await waitForTx(
      await priceOracleInstance.setAssetPrice(reserveAssetAddress, AllAssetsInitialPrices[symbol])
    );

    console.log(`
    New interest bearing asset deployed on ${network}:
    Interest bearing a${symbol} address: ${response.aTokenAddress}
    Variable Debt variableDebt${symbol} address: ${response.variableDebtTokenAddress}
    Stable Debt stableDebt${symbol} address: ${response.stableDebtTokenAddress}
    Strategy Implementation for ${symbol} address: ${rates.address}
    `);
  });
