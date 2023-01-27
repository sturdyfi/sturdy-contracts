import { task } from 'hardhat/config';
import { loadPoolConfig, ConfigNames, getTreasuryAddress } from '../../helpers/configuration';
import { ZERO_ADDRESS } from '../../helpers/constants';
import {
  getAddressById,
  getAToken,
  getFirstSigner,
  getInterestRateStrategy,
  getLendingPoolAddressesProvider,
  getProxy,
  getStableDebtToken,
  getVariableDebtToken,
  getVariableYieldDistribution,
} from '../../helpers/contracts-getters';
import { getParamPerNetwork, verifyContract } from '../../helpers/contracts-helpers';
import { eContractid, eNetwork, ICommonConfiguration, IReserveParams } from '../../helpers/types';
import { LendingPoolConfigurator__factory, LendingPool__factory } from '../../types';

task('verify:tokens', 'Deploy oracles for dev enviroment')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, all, pool }, localDRE) => {
    await localDRE.run('set-DRE');
    const network = localDRE.network.name as eNetwork;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveAssets, ReservesConfig } = poolConfig as ICommonConfiguration;
    const treasuryAddress = await getTreasuryAddress(poolConfig);

    const addressesProvider = await getLendingPoolAddressesProvider();
    const lendingPoolProxy = LendingPool__factory.connect(
      await addressesProvider.getLendingPool(),
      await getFirstSigner()
    );

    const lendingPoolConfigurator = LendingPoolConfigurator__factory.connect(
      await addressesProvider.getLendingPoolConfigurator(),
      await getFirstSigner()
    );

    const yieldDistributor = {
      cvxETH_STETH: (await getVariableYieldDistribution()).address,
      auraWSTETH_WETH: (await getVariableYieldDistribution()).address,
    };
    const configs = Object.entries(ReservesConfig) as [string, IReserveParams][];
    for (const entry of Object.entries(getParamPerNetwork(ReserveAssets, network))) {
      const [token, tokenAddress] = entry;
      console.log(`- Verifying ${token} token related contracts`);
      const {
        stableDebtTokenAddress,
        variableDebtTokenAddress,
        aTokenAddress,
        interestRateStrategyAddress,
      } = await lendingPoolProxy.getReserveData(tokenAddress);

      const tokenConfig = configs.find(([symbol]) => symbol === token);
      if (!tokenConfig) {
        throw `ReservesConfig not found for ${token} token`;
      }

      const {
        optimalUtilizationRate,
        baseVariableBorrowRate,
        variableRateSlope1,
        variableRateSlope2,
        stableRateSlope1,
        stableRateSlope2,
        capacity,
      } = tokenConfig[1].strategy;

      console.log;
      // Proxy Stable Debt
      console.log(`\n- Verifying Stable Debt Token proxy...\n`);
      await verifyContract(
        eContractid.InitializableImmutableAdminUpgradeabilityProxy,
        await getProxy(stableDebtTokenAddress),
        [lendingPoolConfigurator.address]
      );

      // Proxy Variable Debt
      console.log(`\n- Verifying  Debt Token proxy...\n`);
      await verifyContract(
        eContractid.InitializableImmutableAdminUpgradeabilityProxy,
        await getProxy(variableDebtTokenAddress),
        [lendingPoolConfigurator.address]
      );

      // Proxy aToken
      console.log('\n- Verifying aToken proxy...\n');
      await verifyContract(
        eContractid.InitializableImmutableAdminUpgradeabilityProxy,
        await getProxy(aTokenAddress),
        [lendingPoolConfigurator.address]
      );

      // Strategy Rate
      console.log(`\n- Verifying Strategy rate...\n`);
      await verifyContract(
        eContractid.DefaultReserveInterestRateStrategy,
        await getInterestRateStrategy(interestRateStrategyAddress),
        [
          addressesProvider.address,
          optimalUtilizationRate,
          baseVariableBorrowRate,
          variableRateSlope1,
          variableRateSlope2,
          stableRateSlope1,
          stableRateSlope2,
          capacity,
          yieldDistributor[token] || ZERO_ADDRESS,
        ]
      );

      const aToken = await getAddressById(eContractid.AToken);
      const aTokenForCollateral = await getAddressById(eContractid.ATokenForCollateral);

      console.log('\n- Verifying aToken...\n');
      await verifyContract(eContractid.AToken, await getAToken(aToken), []);

      console.log('\n- Verifying aTokenForCollateral...\n');
      await verifyContract(
        eContractid.ATokenForCollateral,
        await getAToken(aTokenForCollateral),
        []
      );

      console.log('\n- Verifying StableDebtToken...\n');
      await verifyContract(eContractid.StableDebtToken, await getStableDebtToken(aToken), []);

      console.log('\n- Verifying VariableDebtToken...\n');
      await verifyContract(eContractid.VariableDebtToken, await getVariableDebtToken(aToken), []);
    }
  });
