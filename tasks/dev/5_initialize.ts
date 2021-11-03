import { task } from 'hardhat/config';
import {
  deployLendingPoolCollateralManager,
  deployAaveProtocolDataProvider,
} from '../../helpers/contracts-deployments';
import {
  ConfigNames,
  getReservesConfigByPool,
  getTreasuryAddress,
  loadPoolConfig,
} from '../../helpers/configuration';

import { tEthereumAddress, AavePools, eContractid } from '../../helpers/types';
import { waitForTx, filterMapBy } from '../../helpers/misc-utils';
import { configureReservesByHelper, initReservesByHelper } from '../../helpers/init-helpers';
import { getAllTokenAddresses } from '../../helpers/mock-helpers';
import { ZERO_ADDRESS } from '../../helpers/constants';
import {
  getAllMockedTokens,
  getLendingPoolAddressesProvider,
} from '../../helpers/contracts-getters';
import { insertContractAddressInDb } from '../../helpers/contracts-helpers';

task('dev:initialize-lending-pool', 'Initialize lending pool configuration.')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, pool }, localBRE) => {
    await localBRE.run('set-DRE');
    const poolConfig = loadPoolConfig(pool);
    const {
      ATokenNamePrefix,
      StableDebtTokenNamePrefix,
      VariableDebtTokenNamePrefix,
      SymbolPrefix,
    } = poolConfig;
    const mockTokens = await getAllMockedTokens();
    const allTokenAddresses = getAllTokenAddresses(mockTokens);

    const addressesProvider = await getLendingPoolAddressesProvider();

    const protoPoolReservesAddresses = <{ [symbol: string]: tEthereumAddress }>(
      filterMapBy(allTokenAddresses, (key: string) => !key.includes('UNI_'))
    );

    const testHelpers = await deployAaveProtocolDataProvider(addressesProvider.address, verify);

    const reservesParams = getReservesConfigByPool(AavePools.proto);

    const admin = await addressesProvider.getPoolAdmin();

    const treasuryAddress = await getTreasuryAddress(poolConfig);

    await initReservesByHelper(
      reservesParams,
      protoPoolReservesAddresses,
      ATokenNamePrefix,
      StableDebtTokenNamePrefix,
      VariableDebtTokenNamePrefix,
      SymbolPrefix,
      admin,
      treasuryAddress,
      ZERO_ADDRESS,
      verify
    );
    await configureReservesByHelper(reservesParams, protoPoolReservesAddresses, testHelpers, admin);

    const collateralManager = await deployLendingPoolCollateralManager(verify);
    await waitForTx(
      await addressesProvider.setLendingPoolCollateralManager(collateralManager.address)
    );

    await insertContractAddressInDb(eContractid.AaveProtocolDataProvider, testHelpers.address);
  });
