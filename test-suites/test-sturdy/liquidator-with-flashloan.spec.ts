/**
 * @dev test for liquidation with flashloan contract
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import {
  getFirstSigner,
  getLendingPoolAddressesProvider,
  getLendingPoolConfiguratorProxy,
} from '../../helpers/contracts-getters';
import BigNumber from 'bignumber.js';
import { RateMode } from '../../helpers/types';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';
import { deployETHLiquidator } from '../../helpers/contracts-deployments';

const { parseEther } = ethers.utils;

makeSuite('Liquidator', (testEnv: TestEnv) => {
  it('call liquidator for stETH for Lido vault', async () => {
    const { deployer, usdc, lido, lidoVault, pool, oracle, users } = testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    const abiEncoder = new ethers.utils.AbiCoder();
    const encodedData = abiEncoder.encode(['address', 'address'], [lido.address, borrower.address]);
    const poolAdminAddress = '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60';
    await impersonateAccountsHardhat([poolAdminAddress]);
    let admin = await ethers.provider.getSigner(poolAdminAddress);

    // deploy liquidator with flashloan contract
    const addressesProvider = await getLendingPoolAddressesProvider();
    const liquidator = await deployETHLiquidator([addressesProvider.address]);

    await lidoVault
      .connect(borrower.signer)
      .depositCollateral(ZERO_ADDRESS, parseEther('10'), { value: parseEther('10') });

    const usdcOwnerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
    const depositUSDC = '50000';
    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    let signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 50000 USDC
    await pool
      .connect(depositor.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

    // borrow
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const usdcPrice = await oracle.getAssetPrice(usdc.address);

    const amountUSDCToBorrow = await convertToCurrencyDecimals(
      usdc.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(usdcPrice.toString())
        .multipliedBy(0.95)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(usdc.address, amountUSDCToBorrow, RateMode.Variable, '0', borrower.address);

    // set liquidation threshold 35%
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator
      .connect(admin)
      .configureReserveAsCollateral(lido.address, '3000', '3500', '10500');

    // process liquidation by using flashloan contract
    await liquidator.liquidation(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, '20000'),
      encodedData
    );

    // withdraw remained usdc from flashloan contract
    const beforeUsdcBalance = await usdc.balanceOf(await (await getFirstSigner()).getAddress());
    await liquidator.withdraw(usdc.address);
    const usdcBalance = await usdc.balanceOf(await (await getFirstSigner()).getAddress());
    expect(
      usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))
    ).to.eq(true);
  });
});

makeSuite('Liquidator', (testEnv: TestEnv) => {
  it('call liquidator for FRAX_3CRV_LP for ConvexFRAX3CRV vault', async () => {
    const { deployer, usdc, FRAX_3CRV_LP, convexFRAX3CRVVault, cvxfrax_3crv, pool, oracle, users } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    const abiEncoder = new ethers.utils.AbiCoder();
    const encodedData = abiEncoder.encode(
      ['address', 'address'],
      [FRAX_3CRV_LP.address, borrower.address]
    );
    const poolAdminAddress = '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60';
    await impersonateAccountsHardhat([poolAdminAddress]);
    let admin = await ethers.provider.getSigner(poolAdminAddress);

    // deploy liquidator with flashloan contract
    const addressesProvider = await getLendingPoolAddressesProvider();
    const liquidator = await deployETHLiquidator([addressesProvider.address]);

    // Prepare some FRAX_3CRV_LP token
    const LPOwnerAddress = '0x005fb56Fe0401a4017e6f046272dA922BBf8dF06';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    const LP_AMOUNT = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '3000');
    await FRAX_3CRV_LP.connect(signer).transfer(borrower.address, LP_AMOUNT);
    await FRAX_3CRV_LP.connect(borrower.signer).approve(convexFRAX3CRVVault.address, LP_AMOUNT);

    await convexFRAX3CRVVault
      .connect(borrower.signer)
      .depositCollateral(FRAX_3CRV_LP.address, LP_AMOUNT);

    const usdcOwnerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
    const depositUSDC = '50000';
    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 50000 USDC
    await pool
      .connect(depositor.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

    // borrow
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const usdcPrice = await oracle.getAssetPrice(usdc.address);

    const amountUSDCToBorrow = await convertToCurrencyDecimals(
      usdc.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(usdcPrice.toString())
        .multipliedBy(0.99)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(usdc.address, amountUSDCToBorrow, RateMode.Variable, '0', borrower.address);

    // set liquidation threshold 35%
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator
      .connect(admin)
      .configureReserveAsCollateral(cvxfrax_3crv.address, '3000', '3200', '10200');

    // process liquidation by using flashloan contract
    await liquidator.liquidation(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, '5000'),
      encodedData
    );

    // withdraw remained usdc from flashloan contract
    const beforeUsdcBalance = await usdc.balanceOf(await (await getFirstSigner()).getAddress());
    await liquidator.withdraw(usdc.address);
    const usdcBalance = await usdc.balanceOf(await (await getFirstSigner()).getAddress());
    expect(
      usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))
    ).to.eq(true);
  });
});

makeSuite('Liquidator', (testEnv: TestEnv) => {
  it('call liquidator for MIM_3CRV_LP for ConvexMIM3CRV vault', async () => {
    const { deployer, usdc, MIM_3CRV_LP, convexMIM3CRVVault, cvxmim_3crv, pool, oracle, users } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    const abiEncoder = new ethers.utils.AbiCoder();
    const encodedData = abiEncoder.encode(
      ['address', 'address'],
      [MIM_3CRV_LP.address, borrower.address]
    );
    const poolAdminAddress = '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60';
    await impersonateAccountsHardhat([poolAdminAddress]);
    let admin = await ethers.provider.getSigner(poolAdminAddress);

    //activate the MIM_3CRV_LP reserve
    let configurator = await getLendingPoolConfiguratorProxy();
    await configurator.connect(admin).activateReserve(await convexMIM3CRVVault.getInternalAsset());
    // deploy liquidator with flashloan contract
    const addressesProvider = await getLendingPoolAddressesProvider();
    const liquidator = await deployETHLiquidator([addressesProvider.address]);

    // Prepare some MIM_3CRV_LP token
    const LPOwnerAddress = '0xe896e539e557BC751860a7763C8dD589aF1698Ce';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    const LP_AMOUNT = await convertToCurrencyDecimals(MIM_3CRV_LP.address, '3000');
    await MIM_3CRV_LP.connect(signer).transfer(borrower.address, LP_AMOUNT);
    await MIM_3CRV_LP.connect(borrower.signer).approve(convexMIM3CRVVault.address, LP_AMOUNT);

    await convexMIM3CRVVault
      .connect(borrower.signer)
      .depositCollateral(MIM_3CRV_LP.address, LP_AMOUNT);

    const usdcOwnerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
    const depositUSDC = '50000';
    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 50000 USDC
    await pool
      .connect(depositor.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

    // borrow
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const usdcPrice = await oracle.getAssetPrice(usdc.address);

    const amountUSDCToBorrow = await convertToCurrencyDecimals(
      usdc.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(usdcPrice.toString())
        .multipliedBy(0.99)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(usdc.address, amountUSDCToBorrow, RateMode.Variable, '0', borrower.address);

    // set liquidation threshold 35%
    configurator = await getLendingPoolConfiguratorProxy();
    await configurator
      .connect(admin)
      .configureReserveAsCollateral(cvxmim_3crv.address, '3000', '3200', '10200');

    // process liquidation by using flashloan contract
    await liquidator.liquidation(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, '5000'),
      encodedData,
      { gasLimit: 2200000 }
    );

    // withdraw remained usdc from flashloan contract
    const beforeUsdcBalance = await usdc.balanceOf(await (await getFirstSigner()).getAddress());
    await liquidator.withdraw(usdc.address);
    const usdcBalance = await usdc.balanceOf(await (await getFirstSigner()).getAddress());
    expect(
      usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))
    ).to.eq(true);
  });
});

makeSuite('Liquidator', (testEnv: TestEnv) => {
  it('call liquidator for DAI_USDC_USDT_SUSD_LP for ConvexDAIUSDCUSDTSUSD vault', async () => {
    const {
      deployer,
      usdc,
      DAI_USDC_USDT_SUSD_LP,
      convexDAIUSDCUSDTSUSDVault,
      cvxdai_usdc_usdt_susd,
      pool,
      oracle,
      users,
    } = testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    const abiEncoder = new ethers.utils.AbiCoder();
    const encodedData = abiEncoder.encode(
      ['address', 'address'],
      [DAI_USDC_USDT_SUSD_LP.address, borrower.address]
    );
    const poolAdminAddress = '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60';
    await impersonateAccountsHardhat([poolAdminAddress]);
    let admin = await ethers.provider.getSigner(poolAdminAddress);

    //activate the DAI_USDC_USDT_SUSD_LP reserve
    let configurator = await getLendingPoolConfiguratorProxy();
    await configurator
      .connect(admin)
      .activateReserve(await convexDAIUSDCUSDTSUSDVault.getInternalAsset());
    // deploy liquidator with flashloan contract
    const addressesProvider = await getLendingPoolAddressesProvider();
    const liquidator = await deployETHLiquidator([addressesProvider.address]);

    // Prepare some DAI_USDC_USDT_SUSD_LP token
    const LPOwnerAddress = '0x8f649FE750340A295dDdbBd7e1EC8f378cF24b42';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    const LP_AMOUNT = await convertToCurrencyDecimals(DAI_USDC_USDT_SUSD_LP.address, '3000');
    await DAI_USDC_USDT_SUSD_LP.connect(signer).transfer(borrower.address, LP_AMOUNT);
    await DAI_USDC_USDT_SUSD_LP.connect(borrower.signer).approve(
      convexDAIUSDCUSDTSUSDVault.address,
      LP_AMOUNT
    );

    await convexDAIUSDCUSDTSUSDVault
      .connect(borrower.signer)
      .depositCollateral(DAI_USDC_USDT_SUSD_LP.address, LP_AMOUNT);

    const usdcOwnerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
    const depositUSDC = '50000';
    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 50000 USDC
    await pool
      .connect(depositor.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

    // borrow
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const usdcPrice = await oracle.getAssetPrice(usdc.address);

    const amountUSDCToBorrow = await convertToCurrencyDecimals(
      usdc.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(usdcPrice.toString())
        .multipliedBy(0.99)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(usdc.address, amountUSDCToBorrow, RateMode.Variable, '0', borrower.address);

    // set liquidation threshold 35%
    configurator = await getLendingPoolConfiguratorProxy();
    await configurator
      .connect(admin)
      .configureReserveAsCollateral(cvxdai_usdc_usdt_susd.address, '3000', '3200', '10200');

    // process liquidation by using flashloan contract
    await liquidator.liquidation(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, '5000'),
      encodedData,
      { gasLimit: 2200000 }
    );

    // withdraw remained usdc from flashloan contract
    const beforeBalance = await DAI_USDC_USDT_SUSD_LP.balanceOf(
      await (await getFirstSigner()).getAddress()
    );
    await liquidator.withdraw(DAI_USDC_USDT_SUSD_LP.address);
    const balance = await DAI_USDC_USDT_SUSD_LP.balanceOf(
      await (await getFirstSigner()).getAddress()
    );
    expect(
      balance.sub(beforeBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))
    ).to.eq(true);
  });
});

makeSuite('Liquidator', (testEnv: TestEnv) => {
  it('call liquidator for IRON_BANK_LP for ConvexIRONBANK vault', async () => {
    const { deployer, usdc, IRON_BANK_LP, convexIronBankVault, cvxiron_bank, pool, oracle, users } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    const abiEncoder = new ethers.utils.AbiCoder();
    const encodedData = abiEncoder.encode(
      ['address', 'address'],
      [IRON_BANK_LP.address, borrower.address]
    );
    const poolAdminAddress = '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60';
    await impersonateAccountsHardhat([poolAdminAddress]);
    let admin = await ethers.provider.getSigner(poolAdminAddress);

    //activate the IRON_BANK_LP reserve
    let configurator = await getLendingPoolConfiguratorProxy();
    await configurator.connect(admin).activateReserve(await convexIronBankVault.getInternalAsset());
    // deploy liquidator with flashloan contract
    const addressesProvider = await getLendingPoolAddressesProvider();
    const liquidator = await deployETHLiquidator([addressesProvider.address]);

    // Prepare some IRON_BANK_LP token
    const LPOwnerAddress = '0x2D2421fF1b3b35e1ca8A20eb89Fb79803b304c01';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    const LP_AMOUNT = await convertToCurrencyDecimals(IRON_BANK_LP.address, '3000');
    await IRON_BANK_LP.connect(signer).transfer(borrower.address, LP_AMOUNT);
    await IRON_BANK_LP.connect(borrower.signer).approve(convexIronBankVault.address, LP_AMOUNT);

    await convexIronBankVault
      .connect(borrower.signer)
      .depositCollateral(IRON_BANK_LP.address, LP_AMOUNT);

    const usdcOwnerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
    const depositUSDC = '50000';
    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 50000 USDC
    await pool
      .connect(depositor.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

    // borrow
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const usdcPrice = await oracle.getAssetPrice(usdc.address);

    const amountUSDCToBorrow = await convertToCurrencyDecimals(
      usdc.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(usdcPrice.toString())
        .multipliedBy(0.99)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(usdc.address, amountUSDCToBorrow, RateMode.Variable, '0', borrower.address);

    // set liquidation threshold 35%
    configurator = await getLendingPoolConfiguratorProxy();
    await configurator
      .connect(admin)
      .configureReserveAsCollateral(cvxiron_bank.address, '3000', '3200', '10200');

    // process liquidation by using flashloan contract
    await liquidator.liquidation(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, '5000'),
      encodedData,
      { gasLimit: 2200000 }
    );

    // withdraw remained usdc from flashloan contract
    const beforeUsdcBalance = await usdc.balanceOf(await (await getFirstSigner()).getAddress());
    await liquidator.withdraw(usdc.address);
    const usdcBalance = await usdc.balanceOf(await (await getFirstSigner()).getAddress());
    expect(
      usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))
    ).to.eq(true);
  });
});

makeSuite('Liquidator', (testEnv: TestEnv) => {
  it('call liquidator for FRAX_USDC_LP for ConvexFRAXUSDC vault', async () => {
    const { deployer, usdc, FRAX_USDC_LP, convexFRAXUSDCVault, cvxfrax_usdc, pool, oracle, users } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    const abiEncoder = new ethers.utils.AbiCoder();
    const encodedData = abiEncoder.encode(
      ['address', 'address'],
      [FRAX_USDC_LP.address, borrower.address]
    );
    const poolAdminAddress = '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60';
    await impersonateAccountsHardhat([poolAdminAddress]);
    let admin = await ethers.provider.getSigner(poolAdminAddress);

    //activate the FRAX_USDC_LP reserve
    let configurator = await getLendingPoolConfiguratorProxy();
    await configurator.connect(admin).activateReserve(await convexFRAXUSDCVault.getInternalAsset());
    // deploy liquidator with flashloan contract
    const addressesProvider = await getLendingPoolAddressesProvider();
    const liquidator = await deployETHLiquidator([addressesProvider.address]);

    // Prepare some FRAX_USDC_LP token
    const LPOwnerAddress = '0x4C8397f58d62E3b8fd1Fa47Ca897672561e5b0B9';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    const LP_AMOUNT = await convertToCurrencyDecimals(FRAX_USDC_LP.address, '3000');
    await FRAX_USDC_LP.connect(signer).transfer(borrower.address, LP_AMOUNT);
    await FRAX_USDC_LP.connect(borrower.signer).approve(convexFRAXUSDCVault.address, LP_AMOUNT);

    await convexFRAXUSDCVault
      .connect(borrower.signer)
      .depositCollateral(FRAX_USDC_LP.address, LP_AMOUNT);

    const usdcOwnerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
    const depositUSDC = '50000';
    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 50000 USDC
    await pool
      .connect(depositor.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

    // borrow
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const usdcPrice = await oracle.getAssetPrice(usdc.address);

    const amountUSDCToBorrow = await convertToCurrencyDecimals(
      usdc.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(usdcPrice.toString())
        .multipliedBy(0.99)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(usdc.address, amountUSDCToBorrow, RateMode.Variable, '0', borrower.address);

    // set liquidation threshold 35%
    configurator = await getLendingPoolConfiguratorProxy();
    await configurator
      .connect(admin)
      .configureReserveAsCollateral(cvxfrax_usdc.address, '3000', '3200', '10200');

    // process liquidation by using flashloan contract
    await liquidator.liquidation(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, '5000'),
      encodedData,
      { gasLimit: 2200000 }
    );

    // withdraw remained usdc from flashloan contract
    const beforeUsdcBalance = await usdc.balanceOf(await (await getFirstSigner()).getAddress());
    await liquidator.withdraw(usdc.address);
    const usdcBalance = await usdc.balanceOf(await (await getFirstSigner()).getAddress());
    expect(
      usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))
    ).to.eq(true);
  });
});
