import { task } from 'hardhat/config';
import {
  eContractid,
  eEthereumNetwork,
  eNetwork,
  IFantomConfiguration,
  PoolConfiguration,
} from '../../helpers/types';
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
import {
  deployDefaultReserveInterestRateStrategy,
  deployTombMiMaticLPOracle,
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

// hardhat external:get-param-for-new-vault --pool Fantom --symbol mooTOMB_MIMATIC --impladdress 0xBc6205F61bB8DB1E68c96752d5CFC6CC8EDc1f07 --network ftm
task('external:get-param-for-new-vault', 'Deploy A token, Debt Tokens, Risk Parameters')
  .addParam('pool', `Pool name to retrieve configuration`)
  .addParam('symbol', `Asset symbol, needs to have configuration ready`)
  .addParam('impladdress', `vault implementation address`)
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ pool, verify, symbol, impladdress }, localBRE) => {
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

    let aTokenToUse: string;

    if (strategyParams.aTokenImpl === eContractid.AToken) {
      aTokenToUse = (await getGenericATokenImpl()).address;
    } else {
      aTokenToUse = (await getCollateralATokenImpl()).address;
    }

    // mooTOMB_MIMATIC reserve
    {
      // Deploy and Register new oracle for new vault
      let mooTombMiMaticOracleAddress = getParamPerNetwork(
        ChainlinkAggregator,
        <eNetwork>network
      ).mooTOMB_MIMATIC;
      if (!mooTombMiMaticOracleAddress) {
        const mooTombMiMaticOracle = await deployTombMiMaticLPOracle();
        mooTombMiMaticOracleAddress = mooTombMiMaticOracle.address;
      }
      const sturdyOracle = await getSturdyOracle();
      const deployerAddress = '0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc';
      const ethers = (localBRE as any).ethers;
      await impersonateAccountsHardhat([deployerAddress]);
      let signer = await ethers.provider.getSigner(deployerAddress);
      await waitForTx(
        await sturdyOracle
          .connect(signer)
          .setAssetSources(
            [
              getParamPerNetwork(config.MIMATIC, <eNetwork>network),
              getParamPerNetwork(ReserveAssets, <eNetwork>network).mooTOMB_MIMATIC,
            ],
            [
              getParamPerNetwork(ChainlinkAggregator, <eNetwork>network).MIMATIC,
              mooTombMiMaticOracleAddress,
            ]
          )
      );
      console.log('_ids: ', [
        localBRE.ethers.utils.formatBytes32String('BEEFY_TOMB_MIMATIC_VAULT').toString(), //implement id
        localBRE.ethers.utils.formatBytes32String('mooTombTOMB-MIMATIC').toString(), //internal asset id
        localBRE.ethers.utils.formatBytes32String('TOMB_MIMATIC_LP').toString(), //external asset id
        //etc...
        localBRE.ethers.utils.formatBytes32String('MIMATIC').toString(),
        localBRE.ethers.utils.formatBytes32String('USDC').toString(),
        localBRE.ethers.utils.formatBytes32String('tombSwapRouter').toString(),
      ]);
      console.log('_addresses: ', [
        impladdress, //implement address
        getParamPerNetwork(config.BeefyVaultTOMB_MIMATIC, <eNetwork>network), //internal asset
        getParamPerNetwork(config.TOMB_MIMATIC_LP, <eNetwork>network), //exterenal asset
        //etc...
        getParamPerNetwork(config.MIMATIC, <eNetwork>network),
        getParamPerNetwork(config.ReserveAssets, <eNetwork>network).USDC,
        getParamPerNetwork(config.TombSwapRouter, <eNetwork>network),
      ]);
    }

    // other reserve
    {
      //...
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