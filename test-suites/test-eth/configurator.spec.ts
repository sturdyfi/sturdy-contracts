import { TestEnv, makeSuite } from './helpers/make-suite';
import { APPROVAL_AMOUNT_LENDING_POOL, RAY } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { ProtocolErrors } from '../../helpers/types';
import { strategyWETH } from '../../markets/eth/reservesConfigs';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';

const { expect } = require('chai');

makeSuite('LendingPoolConfigurator', (testEnv: TestEnv) => {
  const {
    CALLER_NOT_POOL_ADMIN,
    LPC_RESERVE_LIQUIDITY_NOT_0,
    RC_INVALID_LTV,
    RC_INVALID_LIQ_THRESHOLD,
    RC_INVALID_LIQ_BONUS,
    RC_INVALID_DECIMALS,
    RC_INVALID_RESERVE_FACTOR,
  } = ProtocolErrors;

  it('Reverts trying to set an invalid reserve factor', async () => {
    const { configurator, weth } = testEnv;

    const invalidReserveFactor = 65536;

    await expect(
      configurator.setReserveFactor(weth.address, invalidReserveFactor)
    ).to.be.revertedWith(RC_INVALID_RESERVE_FACTOR);
  });

  it('Deactivates the WETH reserve', async () => {
    const { configurator, weth, helpersContract } = testEnv;
    await configurator.deactivateReserve(weth.address);
    const { isActive } = await helpersContract.getReserveConfigurationData(weth.address);
    expect(isActive).to.be.equal(false);
  });

  it('Rectivates the WETH reserve', async () => {
    const { configurator, weth, helpersContract } = testEnv;
    await configurator.activateReserve(weth.address);

    const { isActive } = await helpersContract.getReserveConfigurationData(weth.address);
    expect(isActive).to.be.equal(true);
  });

  it('Check the onlySturdyAdmin on deactivateReserve ', async () => {
    const { configurator, users, weth } = testEnv;
    await expect(
      configurator.connect(users[2].signer).deactivateReserve(weth.address),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });

  it('Check the onlySturdyAdmin on activateReserve ', async () => {
    const { configurator, users, weth } = testEnv;
    await expect(
      configurator.connect(users[2].signer).activateReserve(weth.address),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });

  it('Freezes the WETH reserve', async () => {
    const { configurator, weth, helpersContract } = testEnv;

    await configurator.freezeReserve(weth.address);
    const {
      decimals,
      ltv,
      liquidationBonus,
      liquidationThreshold,
      reserveFactor,
      stableBorrowRateEnabled,
      borrowingEnabled,
      isActive,
      isFrozen,
    } = await helpersContract.getReserveConfigurationData(weth.address);

    expect(borrowingEnabled).to.be.equal(true);
    expect(isActive).to.be.equal(true);
    expect(isFrozen).to.be.equal(true);
    expect(decimals).to.be.equal(strategyWETH.reserveDecimals);
    expect(ltv).to.be.equal(strategyWETH.baseLTVAsCollateral);
    expect(liquidationThreshold).to.be.equal(strategyWETH.liquidationThreshold);
    expect(liquidationBonus).to.be.equal(strategyWETH.liquidationBonus);
    expect(stableBorrowRateEnabled).to.be.equal(strategyWETH.stableBorrowRateEnabled);
    expect(reserveFactor).to.be.equal(strategyWETH.reserveFactor);
  });

  it('Unfreezes the WETH reserve', async () => {
    const { configurator, helpersContract, weth } = testEnv;
    await configurator.unfreezeReserve(weth.address);

    const {
      decimals,
      ltv,
      liquidationBonus,
      liquidationThreshold,
      reserveFactor,
      stableBorrowRateEnabled,
      borrowingEnabled,
      isActive,
      isFrozen,
    } = await helpersContract.getReserveConfigurationData(weth.address);

    expect(borrowingEnabled).to.be.equal(true);
    expect(isActive).to.be.equal(true);
    expect(isFrozen).to.be.equal(false);
    expect(decimals).to.be.equal(strategyWETH.reserveDecimals);
    expect(ltv).to.be.equal(strategyWETH.baseLTVAsCollateral);
    expect(liquidationThreshold).to.be.equal(strategyWETH.liquidationThreshold);
    expect(liquidationBonus).to.be.equal(strategyWETH.liquidationBonus);
    expect(stableBorrowRateEnabled).to.be.equal(strategyWETH.stableBorrowRateEnabled);
    expect(reserveFactor).to.be.equal(strategyWETH.reserveFactor);
  });

  it('Check the onlySturdyAdmin on freezeReserve ', async () => {
    const { configurator, users, weth } = testEnv;
    await expect(
      configurator.connect(users[2].signer).freezeReserve(weth.address),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });

  it('Check the onlySturdyAdmin on unfreezeReserve ', async () => {
    const { configurator, users, weth } = testEnv;
    await expect(
      configurator.connect(users[2].signer).unfreezeReserve(weth.address),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });

  it('Deactivates the WETH reserve for borrowing', async () => {
    const { configurator, helpersContract, weth } = testEnv;
    await configurator.disableBorrowingOnReserve(weth.address);
    const {
      decimals,
      ltv,
      liquidationBonus,
      liquidationThreshold,
      reserveFactor,
      stableBorrowRateEnabled,
      borrowingEnabled,
      isActive,
      isFrozen,
    } = await helpersContract.getReserveConfigurationData(weth.address);

    expect(borrowingEnabled).to.be.equal(false);
    expect(isActive).to.be.equal(true);
    expect(isFrozen).to.be.equal(false);
    expect(decimals).to.be.equal(strategyWETH.reserveDecimals);
    expect(ltv).to.be.equal(strategyWETH.baseLTVAsCollateral);
    expect(liquidationThreshold).to.be.equal(strategyWETH.liquidationThreshold);
    expect(liquidationBonus).to.be.equal(strategyWETH.liquidationBonus);
    expect(stableBorrowRateEnabled).to.be.equal(strategyWETH.stableBorrowRateEnabled);
    expect(reserveFactor).to.be.equal(strategyWETH.reserveFactor);
  });

  it('Activates the WETH reserve for borrowing', async () => {
    const { configurator, weth, helpersContract } = testEnv;
    await configurator.enableBorrowingOnReserve(weth.address, true);
    const { variableBorrowIndex } = await helpersContract.getReserveData(weth.address);

    const {
      decimals,
      ltv,
      liquidationBonus,
      liquidationThreshold,
      reserveFactor,
      stableBorrowRateEnabled,
      borrowingEnabled,
      isActive,
      isFrozen,
    } = await helpersContract.getReserveConfigurationData(weth.address);

    expect(borrowingEnabled).to.be.equal(true);
    expect(isActive).to.be.equal(true);
    expect(isFrozen).to.be.equal(false);
    expect(decimals).to.be.equal(strategyWETH.reserveDecimals);
    expect(ltv).to.be.equal(strategyWETH.baseLTVAsCollateral);
    expect(liquidationThreshold).to.be.equal(strategyWETH.liquidationThreshold);
    expect(liquidationBonus).to.be.equal(strategyWETH.liquidationBonus);
    expect(stableBorrowRateEnabled).to.be.equal(true);
    expect(reserveFactor).to.be.equal(strategyWETH.reserveFactor);

    expect(variableBorrowIndex.toString()).to.be.equal(RAY);
  });

  it('Check the onlySturdyAdmin on disableBorrowingOnReserve ', async () => {
    const { configurator, users, weth } = testEnv;
    await expect(
      configurator.connect(users[2].signer).disableBorrowingOnReserve(weth.address),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });

  it('Check the onlySturdyAdmin on enableBorrowingOnReserve ', async () => {
    const { configurator, users, weth } = testEnv;
    await expect(
      configurator.connect(users[2].signer).enableBorrowingOnReserve(weth.address, true),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });

  it('Deactivates the WETH reserve as collateral', async () => {
    const { configurator, helpersContract, weth } = testEnv;
    await configurator.configureReserveAsCollateral(weth.address, 0, 0, 0);

    const {
      decimals,
      ltv,
      liquidationBonus,
      liquidationThreshold,
      reserveFactor,
      stableBorrowRateEnabled,
      borrowingEnabled,
      isActive,
      isFrozen,
    } = await helpersContract.getReserveConfigurationData(weth.address);

    expect(borrowingEnabled).to.be.equal(true);
    expect(isActive).to.be.equal(true);
    expect(isFrozen).to.be.equal(false);
    expect(decimals).to.be.equal(18);
    expect(ltv).to.be.equal(0);
    expect(liquidationThreshold).to.be.equal(0);
    expect(liquidationBonus).to.be.equal(0);
    expect(stableBorrowRateEnabled).to.be.equal(true);
    expect(reserveFactor).to.be.equal(strategyWETH.reserveFactor);
  });

  it('Activates the WETH reserve as collateral', async () => {
    const { configurator, helpersContract, weth } = testEnv;
    await configurator.configureReserveAsCollateral(weth.address, '0', '0', '0');

    const {
      decimals,
      ltv,
      liquidationBonus,
      liquidationThreshold,
      reserveFactor,
      stableBorrowRateEnabled,
      borrowingEnabled,
      isActive,
      isFrozen,
    } = await helpersContract.getReserveConfigurationData(weth.address);

    expect(borrowingEnabled).to.be.equal(true);
    expect(isActive).to.be.equal(true);
    expect(isFrozen).to.be.equal(false);
    expect(decimals).to.be.equal(strategyWETH.reserveDecimals);
    expect(ltv).to.be.equal(strategyWETH.baseLTVAsCollateral);
    expect(liquidationThreshold).to.be.equal(strategyWETH.liquidationThreshold);
    expect(liquidationBonus).to.be.equal(strategyWETH.liquidationBonus);
    expect(stableBorrowRateEnabled).to.be.equal(true);
    expect(reserveFactor).to.be.equal(strategyWETH.reserveFactor);
  });

  it('Check the onlySturdyAdmin on configureReserveAsCollateral ', async () => {
    const { configurator, users, weth } = testEnv;
    await expect(
      configurator
        .connect(users[2].signer)
        .configureReserveAsCollateral(weth.address, '7500', '8000', '10500'),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });

  it('Disable stable borrow rate on the WETH reserve', async () => {
    const { configurator, helpersContract, weth } = testEnv;
    await configurator.disableReserveStableRate(weth.address);
    const {
      decimals,
      ltv,
      liquidationBonus,
      liquidationThreshold,
      reserveFactor,
      stableBorrowRateEnabled,
      borrowingEnabled,
      isActive,
      isFrozen,
    } = await helpersContract.getReserveConfigurationData(weth.address);

    expect(borrowingEnabled).to.be.equal(true);
    expect(isActive).to.be.equal(true);
    expect(isFrozen).to.be.equal(false);
    expect(decimals).to.be.equal(strategyWETH.reserveDecimals);
    expect(ltv).to.be.equal(strategyWETH.baseLTVAsCollateral);
    expect(liquidationThreshold).to.be.equal(strategyWETH.liquidationThreshold);
    expect(liquidationBonus).to.be.equal(strategyWETH.liquidationBonus);
    expect(stableBorrowRateEnabled).to.be.equal(false);
    expect(reserveFactor).to.be.equal(strategyWETH.reserveFactor);
  });

  it('Enables stable borrow rate on the WETH reserve', async () => {
    const { configurator, helpersContract, weth } = testEnv;
    await configurator.enableReserveStableRate(weth.address);
    const {
      decimals,
      ltv,
      liquidationBonus,
      liquidationThreshold,
      reserveFactor,
      stableBorrowRateEnabled,
      borrowingEnabled,
      isActive,
      isFrozen,
    } = await helpersContract.getReserveConfigurationData(weth.address);

    expect(borrowingEnabled).to.be.equal(true);
    expect(isActive).to.be.equal(true);
    expect(isFrozen).to.be.equal(false);
    expect(decimals).to.be.equal(strategyWETH.reserveDecimals);
    expect(ltv).to.be.equal(strategyWETH.baseLTVAsCollateral);
    expect(liquidationThreshold).to.be.equal(strategyWETH.liquidationThreshold);
    expect(liquidationBonus).to.be.equal(strategyWETH.liquidationBonus);
    expect(stableBorrowRateEnabled).to.be.equal(true);
    expect(reserveFactor).to.be.equal(strategyWETH.reserveFactor);
  });

  it('Check the onlySturdyAdmin on disableReserveStableRate', async () => {
    const { configurator, users, weth } = testEnv;
    await expect(
      configurator.connect(users[2].signer).disableReserveStableRate(weth.address),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });

  it('Check the onlySturdyAdmin on enableReserveStableRate', async () => {
    const { configurator, users, weth } = testEnv;
    await expect(
      configurator.connect(users[2].signer).enableReserveStableRate(weth.address),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });

  it('Changes the reserve factor of WETH', async () => {
    const { configurator, helpersContract, weth } = testEnv;
    await configurator.setReserveFactor(weth.address, '2');
    const {
      decimals,
      ltv,
      liquidationBonus,
      liquidationThreshold,
      reserveFactor,
      stableBorrowRateEnabled,
      borrowingEnabled,
      isActive,
      isFrozen,
    } = await helpersContract.getReserveConfigurationData(weth.address);

    expect(borrowingEnabled).to.be.equal(true);
    expect(isActive).to.be.equal(true);
    expect(isFrozen).to.be.equal(false);
    expect(decimals).to.be.equal(strategyWETH.reserveDecimals);
    expect(ltv).to.be.equal(strategyWETH.baseLTVAsCollateral);
    expect(liquidationThreshold).to.be.equal(strategyWETH.liquidationThreshold);
    expect(liquidationBonus).to.be.equal(strategyWETH.liquidationBonus);
    expect(stableBorrowRateEnabled).to.be.equal(true);
    expect(reserveFactor).to.be.equal(2);
  });

  it('Check the onlyLendingPoolManager on setReserveFactor', async () => {
    const { configurator, users, weth } = testEnv;
    await expect(
      configurator.connect(users[2].signer).setReserveFactor(weth.address, '2000'),
      CALLER_NOT_POOL_ADMIN
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });

  it('Reverts when trying to disable the WETH reserve with liquidity on it', async () => {
    const { weth, pool, configurator, deployer } = testEnv;
    const userAddress = await pool.signer.getAddress();
    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    const ethers = (DRE as any).ethers;

    await impersonateAccountsHardhat([wethOwnerAddress]);
    const signer = await ethers.provider.getSigner(wethOwnerAddress);

    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, '2');
    await weth.connect(signer).transfer(deployer.address, amountWETHtoDeposit);

    //approve protocol to access depositor wallet
    await weth.connect(deployer.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //user 1 deposits 2 WETH
    await pool.connect(deployer.signer).deposit(weth.address, amountWETHtoDeposit, userAddress, '0');

    await expect(
      configurator.deactivateReserve(weth.address),
      LPC_RESERVE_LIQUIDITY_NOT_0
    ).to.be.revertedWith(LPC_RESERVE_LIQUIDITY_NOT_0);
  });
});
