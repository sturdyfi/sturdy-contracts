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
} from '../../helpers/contracts-getters';
import { verifyContract, getParamPerNetwork } from '../../helpers/contracts-helpers';
import { DRE, notFalsyOrZeroAddress } from '../../helpers/misc-utils';
import { eContractid, eNetwork, ICommonConfiguration, SymbolMap } from '../../helpers/types';

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
      ProtocolGlobalParams: { UsdAddress },
    } = poolConfig as ICommonConfiguration;
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

      // // Address Provider
      // console.log('\n- Verifying address provider...\n');
      // await verifyContract(eContractid.LendingPoolAddressesProvider, addressesProvider, [MarketId]);

      // // Sturdy Oracle
      // const reserveAssets = await getParamPerNetwork(ReserveAssets, network);
      // const chainlinkAggregators = await getParamPerNetwork(ChainlinkAggregator, network);
      // const fallbackOracleAddress = await getParamPerNetwork(FallbackOracle, network);
      // const tokensToWatch: SymbolMap<string> = {
      //   ...reserveAssets,
      //   USD: UsdAddress,
      // };
      // const [tokens, aggregators] = getPairsTokenAggregator(
      //   tokensToWatch,
      //   chainlinkAggregators,
      //   poolConfig.OracleQuoteCurrency
      // );

      // console.log('\n- Verifying sturdy oracle...\n');
      // await verifyContract(eContractid.SturdyOracle, oracle, [
      //   tokens,
      //   aggregators,
      //   Array(tokens.length).fill(false),
      //   fallbackOracleAddress,
      //   await getQuoteCurrency(poolConfig),
      //   poolConfig.OracleQuoteUnit,
      // ]);

      // // Address Provider Registry
      // console.log('\n- Verifying address provider registry...\n');
      // await verifyContract(
      //   eContractid.LendingPoolAddressesProviderRegistry,
      //   addressesProviderRegistry,
      //   []
      // );

      // // Lending Pool implementation
      // console.log('\n- Verifying LendingPool Implementation...\n');
      // await verifyContract(eContractid.LendingPool, lendingPoolImpl, []);

      // // Lending Pool Configurator implementation
      // console.log('\n- Verifying LendingPool Configurator Implementation...\n');
      // await verifyContract(eContractid.LendingPoolConfigurator, lendingPoolConfiguratorImpl, []);

      // // Lending Pool Collateral Manager implementation
      // console.log('\n- Verifying LendingPool Collateral Manager Implementation...\n');
      // await verifyContract(
      //   eContractid.LendingPoolCollateralManager,
      //   lendingPoolCollateralManagerImpl,
      //   []
      // );

      // // IncentiveController implementation
      // console.log('\n- Verifying IncentiveController Implementation...\n');
      // await verifyContract(eContractid.StakedTokenIncentivesController, incentiveControllerImpl, [
      //   EMISSION_EXECUTOR,
      // ]);

      // // Test helpers
      // console.log('\n- Verifying  Sturdy  Provider Helpers...\n');
      // await verifyContract(eContractid.SturdyProtocolDataProvider, dataProvider, [
      //   addressesProvider.address,
      // ]);

      // // WalletBalanceProvider implementation
      // console.log('\n- Verifying WalletBalanceProvider Implementation...\n');
      // await verifyContract(eContractid.WalletBalanceProvider, walletBalanceProvider, []);

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
    // const lidoVaultAddress = await addressesProvider.getAddress(
    //   DRE.ethers.utils.formatBytes32String('LIDO_VAULT')
    // );
    // const lidoVaultProxy = await getProxy(lidoVaultAddress);
    // if (all) {
    //   const lidoVaultImpl = await getLidoVaultImpl();

    //   // LidoVault implementation
    //   console.log('\n- Verifying LidoVault Implementation...\n');
    //   await verifyContract(eContractid.LidoVault, lidoVaultImpl, []);
    // }

    // // LidoVault proxy
    // console.log('\n- Verifying  LidoVault Proxy...\n');
    // await verifyContract(
    //   eContractid.InitializableImmutableAdminUpgradeabilityProxy,
    //   lidoVaultProxy,
    //   [addressesProvider.address]
    // );

    console.log('Finished verifications.');
  });
