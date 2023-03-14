/**
 * @dev test for liquidation with flashloan contract
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
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

makeSuite('Liquidator', (testEnv: TestEnv) => {
  it('call liquidator for ETH_STETH_LP for ConvexETHSTETH vault', async () => {
    const { weth, ETH_STETH_LP, convexETHSTETHVault, cvxeth_steth, pool, oracle, users } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    const abiEncoder = new ethers.utils.AbiCoder();
    const encodedData = abiEncoder.encode(
      ['address', 'address', 'uint256'],
      [ETH_STETH_LP.address, borrower.address, 50]
    );
    const poolAdminAddress = '0xb4124ceb3451635dacedd11767f004d8a28c6ee7'; //'0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60';
    await impersonateAccountsHardhat([poolAdminAddress]);
    let admin = await ethers.provider.getSigner(poolAdminAddress);

    // deploy liquidator with flashloan contract
    const addressesProvider = await getLendingPoolAddressesProvider();
    const liquidator = await deployETHLiquidator([addressesProvider.address]);

    // Prepare some ETH_STETH_LP token
    const LPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    const LP_AMOUNT = await convertToCurrencyDecimals(ETH_STETH_LP.address, '10');
    await ETH_STETH_LP.connect(signer).transfer(borrower.address, LP_AMOUNT);
    await ETH_STETH_LP.connect(borrower.signer).approve(convexETHSTETHVault.address, LP_AMOUNT);

    await convexETHSTETHVault
      .connect(borrower.signer)
      .depositCollateral(ETH_STETH_LP.address, LP_AMOUNT);

    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    const depositWETH = '10';
    //Make some test WETH for depositor
    await impersonateAccountsHardhat([wethOwnerAddress]);
    signer = await ethers.provider.getSigner(wethOwnerAddress);
    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, depositWETH);
    await weth.connect(signer).transfer(depositor.address, amountWETHtoDeposit);

    //approve protocol to access depositor wallet
    await weth.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 10 WETH
    await pool
      .connect(depositor.signer)
      .deposit(weth.address, amountWETHtoDeposit, depositor.address, '0');

    // borrow
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const wethPrice = await oracle.getAssetPrice(weth.address);

    const amountWETHToBorrow = await convertToCurrencyDecimals(
        weth.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(wethPrice.toString())
        .multipliedBy(0.99)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(weth.address, amountWETHToBorrow, RateMode.Variable, '0', borrower.address);

    // set liquidation threshold 35%
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator
      .connect(admin)
      .configureReserveAsCollateral(cvxeth_steth.address, '3000', '3200', '10200');

    // process liquidation by using flashloan contract
    await liquidator.liquidation(
      await convertToCurrencyDecimals(weth.address, '5'),
      '1',
      encodedData
    );

    // withdraw remained weth from flashloan contract
    const beforeWethBalance = await weth.balanceOf(await (await getFirstSigner()).getAddress());
    await liquidator.withdraw(weth.address);
    const wethBalance = await weth.balanceOf(await (await getFirstSigner()).getAddress());
    expect(
        wethBalance.sub(beforeWethBalance).gt(await convertToCurrencyDecimals(weth.address, '0.03'))
    ).to.eq(true);
  });
});

makeSuite('Liquidator', (testEnv: TestEnv) => {
  it('call liquidator for BAL_WSTETH_WETH_LP for AuraWSTETHWETH vault', async () => {
    const { weth, BAL_WSTETH_WETH_LP, auraWSTETHWETHVault, aurawsteth_weth, pool, oracle, users } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    const abiEncoder = new ethers.utils.AbiCoder();
    const encodedData = abiEncoder.encode(
      ['address', 'address', 'uint256'],
      [BAL_WSTETH_WETH_LP.address, borrower.address, 50]
    );
    const poolAdminAddress = '0xb4124ceb3451635dacedd11767f004d8a28c6ee7'; //'0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60';
    await impersonateAccountsHardhat([poolAdminAddress]);
    let admin = await ethers.provider.getSigner(poolAdminAddress);

    // deploy liquidator with flashloan contract
    const addressesProvider = await getLendingPoolAddressesProvider();
    const liquidator = await deployETHLiquidator([addressesProvider.address]);

    // Prepare some BAL_WSTETH_WETH_LP token
    const LPOwnerAddress = '0x21ac89788d52070D23B8EaCEcBD3Dc544178DC60';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    const LP_AMOUNT = await convertToCurrencyDecimals(BAL_WSTETH_WETH_LP.address, '10');
    await BAL_WSTETH_WETH_LP.connect(signer).transfer(borrower.address, LP_AMOUNT);
    await BAL_WSTETH_WETH_LP.connect(borrower.signer).approve(auraWSTETHWETHVault.address, LP_AMOUNT);

    await auraWSTETHWETHVault
      .connect(borrower.signer)
      .depositCollateral(BAL_WSTETH_WETH_LP.address, LP_AMOUNT);

    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    const depositWETH = '10';
    //Make some test WETH for depositor
    await impersonateAccountsHardhat([wethOwnerAddress]);
    signer = await ethers.provider.getSigner(wethOwnerAddress);
    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, depositWETH);
    await weth.connect(signer).transfer(depositor.address, amountWETHtoDeposit);

    //approve protocol to access depositor wallet
    await weth.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 10 WETH
    await pool
      .connect(depositor.signer)
      .deposit(weth.address, amountWETHtoDeposit, depositor.address, '0');

    // borrow
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const wethPrice = await oracle.getAssetPrice(weth.address);

    const amountWETHToBorrow = await convertToCurrencyDecimals(
        weth.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(wethPrice.toString())
        .multipliedBy(0.99)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(weth.address, amountWETHToBorrow, RateMode.Variable, '0', borrower.address);

    // set liquidation threshold 35%
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator
      .connect(admin)
      .configureReserveAsCollateral(aurawsteth_weth.address, '3000', '3200', '10200');

    // process liquidation by using flashloan contract
    await liquidator.liquidation(
      await convertToCurrencyDecimals(weth.address, '5'),
      '0',
      encodedData
    );

    // withdraw remained weth from flashloan contract
    const beforeWethBalance = await weth.balanceOf(await (await getFirstSigner()).getAddress());
    await liquidator.withdraw(weth.address);
    const wethBalance = await weth.balanceOf(await (await getFirstSigner()).getAddress());
    expect(
        wethBalance.sub(beforeWethBalance).gt(await convertToCurrencyDecimals(weth.address, '0.03'))
    ).to.eq(true);
  });
});

makeSuite('Liquidator', (testEnv: TestEnv) => {
  it('call liquidator for BAL_RETH_WETH_LP for AuraRETHWETH vault', async () => {
    const { weth, BAL_RETH_WETH_LP, auraRETHWETHVault, aurareth_weth, pool, oracle, users } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    const abiEncoder = new ethers.utils.AbiCoder();
    const encodedData = abiEncoder.encode(
      ['address', 'address', 'uint256'],
      [BAL_RETH_WETH_LP.address, borrower.address, 50]
    );
    const poolAdminAddress = '0xb4124ceb3451635dacedd11767f004d8a28c6ee7'; //'0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60';
    await impersonateAccountsHardhat([poolAdminAddress]);
    let admin = await ethers.provider.getSigner(poolAdminAddress);

    // deploy liquidator with flashloan contract
    const addressesProvider = await getLendingPoolAddressesProvider();
    const liquidator = await deployETHLiquidator([addressesProvider.address]);

    // Prepare some BAL_RETH_WETH_LP token
    const LPOwnerAddress = '0x5f98718e4e0EFcb7B5551E2B2584E6781ceAd867';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    const LP_AMOUNT = await convertToCurrencyDecimals(BAL_RETH_WETH_LP.address, '10');
    await BAL_RETH_WETH_LP.connect(signer).transfer(borrower.address, LP_AMOUNT);
    await BAL_RETH_WETH_LP.connect(borrower.signer).approve(auraRETHWETHVault.address, LP_AMOUNT);

    await auraRETHWETHVault
      .connect(borrower.signer)
      .depositCollateral(BAL_RETH_WETH_LP.address, LP_AMOUNT);

    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    const depositWETH = '10';
    //Make some test WETH for depositor
    await impersonateAccountsHardhat([wethOwnerAddress]);
    signer = await ethers.provider.getSigner(wethOwnerAddress);
    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, depositWETH);
    await weth.connect(signer).transfer(depositor.address, amountWETHtoDeposit);

    //approve protocol to access depositor wallet
    await weth.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 10 WETH
    await pool
      .connect(depositor.signer)
      .deposit(weth.address, amountWETHtoDeposit, depositor.address, '0');

    // borrow
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const wethPrice = await oracle.getAssetPrice(weth.address);

    const amountWETHToBorrow = await convertToCurrencyDecimals(
        weth.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(wethPrice.toString())
        .multipliedBy(0.99)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(weth.address, amountWETHToBorrow, RateMode.Variable, '0', borrower.address);

    // set liquidation threshold 35%
    const configurator = await getLendingPoolConfiguratorProxy();
    await configurator
      .connect(admin)
      .configureReserveAsCollateral(aurareth_weth.address, '3000', '3200', '10200');

    // process liquidation by using flashloan contract
    await liquidator.liquidation(
      await convertToCurrencyDecimals(weth.address, '5'),
      '0',
      encodedData
    );

    // withdraw remained weth from flashloan contract
    const beforeWethBalance = await weth.balanceOf(await (await getFirstSigner()).getAddress());
    await liquidator.withdraw(weth.address);
    const wethBalance = await weth.balanceOf(await (await getFirstSigner()).getAddress());
    expect(
        wethBalance.sub(beforeWethBalance).gt(await convertToCurrencyDecimals(weth.address, '0.03'))
    ).to.eq(true);
  });
});