import { task } from 'hardhat/config';
import { loadPoolConfig, ConfigNames, getQuoteCurrency } from '../../helpers/configuration';
import {
  getSturdyProtocolDataProvider,
  getLendingPoolAddressesProvider,
  getLendingPoolAddressesProviderRegistry,
  getLendingPoolCollateralManagerImpl,
  getLendingPoolConfiguratorImpl,
  getLendingPoolImpl,
  getProxy,
  getSturdyIncentivesControllerImpl,
  getSturdyTokenImpl,
  getFirstSigner,
  getWalletProvider,
  getUiPoolDataProvider,
  getUiIncentiveDataProvider,
  getSturdyOracle,
  getPairsTokenAggregator,
  getConvexETHSTETHVault,
  getConvexETHSTETHVaultImpl,
  getAuraWSTETHWETHVault,
  getAuraWSTETHWETHVaultImpl,
  getETHSTETHLevSwap,
  getAURAWSTETHWETHLevSwap,
} from '../../helpers/contracts-getters';
import { verifyContract, getParamPerNetwork } from '../../helpers/contracts-helpers';
import { DRE, notFalsyOrZeroAddress } from '../../helpers/misc-utils';
import {
  eContractid,
  eNetwork,
  ICommonConfiguration,
  IEthConfiguration,
  SymbolMap,
} from '../../helpers/types';

task('verify:general', 'Verify contracts at Etherscan')
  .addFlag('all', 'Verify all contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ all, pool }, localDRE) => {
    await localDRE.run('set-DRE');
    const network = localDRE.network.name as eNetwork;
    const poolConfig = loadPoolConfig(pool);
    const {
      ProviderRegistry,
      MarketId,
      LendingPoolCollateralManager,
      LendingPoolConfigurator,
      ReserveAssets,
      FallbackOracle,
      ChainlinkAggregator,
      ETH_STETH_LP,
      BAL_WSTETH_WETH_LP,
      ProtocolGlobalParams: { UsdAddress },
    } = poolConfig as IEthConfiguration;
    const signer = await getFirstSigner();
    const EMISSION_EXECUTOR = await signer.getAddress();
    const registryAddress = getParamPerNetwork(ProviderRegistry, network);
    const addressesProvider = await getLendingPoolAddressesProvider();
    const addressesProviderRegistry = notFalsyOrZeroAddress(registryAddress)
      ? await getLendingPoolAddressesProviderRegistry(registryAddress)
      : await getLendingPoolAddressesProviderRegistry();
    const lendingPoolAddress = await addressesProvider.getLendingPool();
    const lendingPoolConfiguratorAddress = await addressesProvider.getLendingPoolConfigurator(); //getLendingPoolConfiguratorProxy();
    const lendingPoolCollateralManagerAddress =
      await addressesProvider.getLendingPoolCollateralManager();
    const incentiveControllerAddress = await addressesProvider.getIncentiveController();
    const incentiveTokenAddress = await addressesProvider.getIncentiveToken();
    const oracleAddress = await addressesProvider.getPriceOracle();
    // const oracle = await getPriceOracle();
    const oracle = await getSturdyOracle();

    const lendingPoolProxy = await getProxy(lendingPoolAddress);
    const lendingPoolConfiguratorProxy = await getProxy(lendingPoolConfiguratorAddress);
    const lendingPoolCollateralManagerProxy = await getProxy(lendingPoolCollateralManagerAddress);
    const incentiveControllerProxy = await getProxy(incentiveControllerAddress);
    const incentiveTokenProxy = await getProxy(incentiveTokenAddress);

    if (all) {
      const lendingPoolImpl = await getLendingPoolImpl();

      const incentiveControllerImpl = await getSturdyIncentivesControllerImpl();
      const walletBalanceProvider = await getWalletProvider();
      const uiPoolDataProvider = await getUiPoolDataProvider();
      const uiIncentiveDataProvider = await getUiIncentiveDataProvider();

      const lendingPoolConfiguratorImplAddress = getParamPerNetwork(
        LendingPoolConfigurator,
        network
      );
      const lendingPoolConfiguratorImpl = notFalsyOrZeroAddress(lendingPoolConfiguratorImplAddress)
        ? await getLendingPoolConfiguratorImpl(lendingPoolConfiguratorImplAddress)
        : await getLendingPoolConfiguratorImpl();

      const lendingPoolCollateralManagerImplAddress = getParamPerNetwork(
        LendingPoolCollateralManager,
        network
      );
      const lendingPoolCollateralManagerImpl = notFalsyOrZeroAddress(
        lendingPoolCollateralManagerImplAddress
      )
        ? await getLendingPoolCollateralManagerImpl(lendingPoolCollateralManagerImplAddress)
        : await getLendingPoolCollateralManagerImpl();

      const dataProvider = await getSturdyProtocolDataProvider();

      // Address Provider
      console.log('\n- Verifying address provider...\n');
      await verifyContract(eContractid.LendingPoolAddressesProvider, addressesProvider, [MarketId]);

      // Sturdy Oracle
      const reserveAssets = await getParamPerNetwork(ReserveAssets, network);
      const chainlinkAggregators = await getParamPerNetwork(ChainlinkAggregator, network);
      const fallbackOracleAddress = await getParamPerNetwork(FallbackOracle, network);
      const tokensToWatch: SymbolMap<string> = {
        ...reserveAssets,
        USD: UsdAddress,
      };
      const [tokens, aggregators] = getPairsTokenAggregator(
        tokensToWatch,
        chainlinkAggregators,
        poolConfig.OracleQuoteCurrency
      );

      console.log('\n- Verifying sturdy oracle...\n');
      await verifyContract(eContractid.SturdyOracle, oracle, [
        tokens,
        aggregators,
        Array(tokens.length).fill(false),
        fallbackOracleAddress,
        await getQuoteCurrency(poolConfig),
        poolConfig.OracleQuoteUnit,
      ]);

      // Address Provider Registry
      console.log('\n- Verifying address provider registry...\n');
      await verifyContract(
        eContractid.LendingPoolAddressesProviderRegistry,
        addressesProviderRegistry,
        []
      );

      // Lending Pool implementation
      console.log('\n- Verifying LendingPool Implementation...\n');
      await verifyContract(eContractid.LendingPool, lendingPoolImpl, []);

      // Lending Pool Configurator implementation
      console.log('\n- Verifying LendingPool Configurator Implementation...\n');
      await verifyContract(eContractid.LendingPoolConfigurator, lendingPoolConfiguratorImpl, []);

      // Lending Pool Collateral Manager implementation
      console.log('\n- Verifying LendingPool Collateral Manager Implementation...\n');
      await verifyContract(
        eContractid.LendingPoolCollateralManager,
        lendingPoolCollateralManagerImpl,
        []
      );

      // IncentiveController implementation
      console.log('\n- Verifying IncentiveController Implementation...\n');
      await verifyContract(eContractid.StakedTokenIncentivesController, incentiveControllerImpl, [
        EMISSION_EXECUTOR,
      ]);

      // Test helpers
      console.log('\n- Verifying  Sturdy  Provider Helpers...\n');
      await verifyContract(eContractid.SturdyProtocolDataProvider, dataProvider, [
        addressesProvider.address,
      ]);

      // WalletBalanceProvider implementation
      console.log('\n- Verifying WalletBalanceProvider Implementation...\n');
      await verifyContract(eContractid.WalletBalanceProvider, walletBalanceProvider, []);

      // UiPoolDataProvider implementation
      console.log(incentiveControllerAddress, oracleAddress);
      console.log('\n- Verifying  UiPoolDataProvider Implementation...\n');
      await verifyContract(eContractid.UiPoolDataProvider, uiPoolDataProvider, [
        incentiveControllerAddress,
        oracleAddress,
      ]);

      // UiIncentiveDataProvider implementation
      console.log('\n- Verifying UiIncentiveDataProvider Implementation...\n');
      await verifyContract(eContractid.UiIncentiveDataProvider, uiIncentiveDataProvider, []);
    }
    // Lending Pool proxy
    console.log('\n- Verifying  Lending Pool Proxy...\n');
    await verifyContract(
      eContractid.InitializableImmutableAdminUpgradeabilityProxy,
      lendingPoolProxy,
      [addressesProvider.address]
    );

    // LendingPool Conf proxy
    console.log('\n- Verifying  Lending Pool Configurator Proxy...\n');
    await verifyContract(
      eContractid.InitializableImmutableAdminUpgradeabilityProxy,
      lendingPoolConfiguratorProxy,
      [addressesProvider.address]
    );

    // LendingPoolCollateralManager proxy
    console.log('\n- Verifying  Lending Pool Collateral Manager Proxy...\n');
    await verifyContract(
      eContractid.InitializableImmutableAdminUpgradeabilityProxy,
      lendingPoolCollateralManagerProxy,
      []
    );

    // IncentiveController proxy
    console.log('\n- Verifying  IncentiveController Proxy...\n');
    await verifyContract(
      eContractid.InitializableImmutableAdminUpgradeabilityProxy,
      incentiveControllerProxy,
      [addressesProvider.address]
    );

    // IncentiveToken proxy
    console.log('\n- Verifying  IncentiveToken Proxy...\n');
    await verifyContract(
      eContractid.InitializableImmutableAdminUpgradeabilityProxy,
      incentiveTokenProxy,
      [addressesProvider.address]
    );

    // Verifying vaults
    const convexETHSTETHVault = await getConvexETHSTETHVault();
    const convexETHSTETHVaultProxy = await getProxy(convexETHSTETHVault.address);
    if (all) {
      const convexETHSTETHVaultImpl = await getConvexETHSTETHVaultImpl();

      // convexETHSTETHVault implementation
      console.log('\n- Verifying convexETHSTETHVault Implementation...\n');
      await verifyContract(eContractid.ConvexETHSTETHVault, convexETHSTETHVaultImpl, []);
    }

    // convexETHSTETHVault proxy
    console.log('\n- Verifying  convexETHSTETHVault Proxy...\n');
    await verifyContract(
      eContractid.InitializableImmutableAdminUpgradeabilityProxy,
      convexETHSTETHVaultProxy,
      [addressesProvider.address]
    );

    const auraWSTETHWETHVault = await getAuraWSTETHWETHVault();
    const auraWSTETHWETHVaultProxy = await getProxy(auraWSTETHWETHVault.address);
    if (all) {
      const auraWSTETHWETHVaultImpl = await getAuraWSTETHWETHVaultImpl();

      // auraWSTETHWETHVault implementation
      console.log('\n- Verifying auraWSTETHWETHVault Implementation...\n');
      await verifyContract(eContractid.AuraWSTETHWETHVault, auraWSTETHWETHVaultImpl, []);
    }

    // auraWSTETHWETHVault proxy
    console.log('\n- Verifying  auraWSTETHWETHVault Proxy...\n');
    await verifyContract(
      eContractid.InitializableImmutableAdminUpgradeabilityProxy,
      auraWSTETHWETHVaultProxy,
      [addressesProvider.address]
    );

    // Verifying Leverage contract
    const convexETHSTETHLeverage = await getETHSTETHLevSwap();
    console.log('\n- Verifying convexETHSTETHLeverage...\n');
    await verifyContract(eContractid.ETHSTETHLevSwap, convexETHSTETHLeverage, [
      getParamPerNetwork(ETH_STETH_LP, network),
      convexETHSTETHVault.address,
      addressesProvider.address,
    ]);

    const auraWSTETHWETHLeverage = await getAURAWSTETHWETHLevSwap();
    console.log('\n- Verifying auraWSTETHWETHLeverage...\n');
    await verifyContract(eContractid.AURAWSTETHWETHLevSwap, auraWSTETHWETHLeverage, [
      getParamPerNetwork(BAL_WSTETH_WETH_LP, network),
      auraWSTETHWETHVault.address,
      addressesProvider.address,
    ]);

    console.log('Finished verifications.');
  });
