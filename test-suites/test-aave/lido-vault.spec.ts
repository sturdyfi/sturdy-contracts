/**
 * @dev test for LidoVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { printDivider } from './helpers/utils/helpers';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';
import { ILidoFactory } from '../../types/ILidoFactory';

const { parseEther } = ethers.utils;

makeSuite('LidoVault', (testEnv: TestEnv) => {
  it('failed deposit for collateral without ether', async () => {
    const { lidoVault } = testEnv;

    await expect(lidoVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.reverted;
  });

  it('deposit ETH for collateral', async () => {
    const { lidoVault, deployer, lido, aStETH } = testEnv;
    const beforePooledEther = await lido.getTotalPooledEther();
    await lidoVault.depositCollateral(ZERO_ADDRESS, 0, { value: parseEther('1.1') });
    const currentPooledEther = await lido.getTotalPooledEther();
    expect(currentPooledEther.sub(beforePooledEther)).to.be.equal(parseEther('1.1'));
    expect(await lido.balanceOf(lidoVault.address)).to.be.equal(0);
    expect(await aStETH.balanceOf(lidoVault.address)).to.be.equal(0);
    expect((await aStETH.balanceOf(deployer.address)).gt(parseEther('0.9'))).to.be.equal(true);
    expect(await ethers.getDefaultProvider().getBalance(lidoVault.address)).to.be.equal(0);
  });

  it('stETH & aStETH balance check after deposit for collateral', async () => {
    const { lidoVault, deployer, lido, aStETH } = testEnv;
    const stETHBalanceOfPool = await lido.balanceOf(lidoVault.address);
    const aTokensBalance = await aStETH.balanceOf(deployer.address);
    expect(stETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(aTokensBalance).to.be.equal(parseEther('1.1'));
  });

  it('transfering aStETH should be success after deposit ETH', async () => {
    const { aStETH, users } = testEnv;
    await expect(aStETH.transfer(users[0].address, parseEther('0.05'))).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, lidoVault } = testEnv;
    await expect(lidoVault.withdrawCollateral(ZERO_ADDRESS, parseEther('1.2'), deployer.address)).to
      .be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, lido, lidoVault } = testEnv;
    const stETHBalanceOfPool = await lido.balanceOf(lidoVault.address);
    const ethBeforeBalanceOfUser = await deployer.signer.getBalance();

    await lidoVault.withdrawCollateral(ZERO_ADDRESS, parseEther('1'), deployer.address);

    const ethCurrentBalanceOfUser = await deployer.signer.getBalance();
    expect(stETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(ethCurrentBalanceOfUser.sub(ethBeforeBalanceOfUser).gt(parseEther('0.9'))).to.be.equal(
      true
    );
    expect(await ethers.getDefaultProvider().getBalance(lidoVault.address)).to.be.equal(0);
  });
});

makeSuite('LidoVault - use other coin as collatoral', (testEnv) => {
  it('Should revert to use any of coin other than ETH, stETH as collatoral. ', async () => {
    const { lido, usdc, users, lidoVault } = testEnv;
    const ethers = (DRE as any).ethers;
    const usdcOwnerAddress = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
    const depositor = users[0];
    const depositor2 = users[1];
    printDivider();

    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    let signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, '1000');
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(lidoVault.address, APPROVAL_AMOUNT_LENDING_POOL);

    //depositor deposits 1000 usdc as collateral
    await expect(
      lidoVault.connect(depositor.signer).depositCollateral(usdc.address, amountUSDCtoDeposit)
    ).to.be.reverted;

    const stETHOwnerAddress = '0x06920C9fC643De77B99cB7670A944AD31eaAA260';
    const depositStETH = '10';
    //Make some test stETH for depositor2
    await impersonateAccountsHardhat([stETHOwnerAddress]);
    signer = await ethers.provider.getSigner(stETHOwnerAddress);
    await lido
      .connect(signer)
      .transfer(depositor2.address, await convertToCurrencyDecimals(lido.address, depositStETH));

    //approve protocol to access depositor wallet
    await lido.connect(depositor2.signer).approve(lidoVault.address, APPROVAL_AMOUNT_LENDING_POOL);

    //deposits 5 stETH for collateral
    const amountStETHtoDeposit = await convertToCurrencyDecimals(lido.address, '5');
    await expect(
      lidoVault.connect(depositor2.signer).depositCollateral(lido.address, amountStETHtoDeposit)
    ).to.not.be.reverted;
  });
});

makeSuite('LidoVault', (testEnv: TestEnv) => {
  it('distribute yield to supplier', async () => {
    const { pool, lidoVault, usdc, users, lido, aUsdc, aStETH } = testEnv;
    const depositor = users[0];
    const borrower = users[1];
    const ethers = (DRE as any).ethers;
    const usdcOwnerAddress = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
    const depositUSDC = '7000';
    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    let signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 7000 USDC
    await pool
      .connect(depositor.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

    const stETHOwnerAddress = '0x06920C9fC643De77B99cB7670A944AD31eaAA260';
    const depositStETH = '10';
    const depositStETHAmount = await convertToCurrencyDecimals(lido.address, depositStETH);
    //Make some test stETH for borrower
    await impersonateAccountsHardhat([stETHOwnerAddress]);
    signer = await ethers.provider.getSigner(stETHOwnerAddress);

    //transfer to borrower
    await lido.connect(signer).transfer(borrower.address, depositStETHAmount);

    //approve protocol to access borrower wallet
    await lido.connect(borrower.signer).approve(lidoVault.address, APPROVAL_AMOUNT_LENDING_POOL);

    // deposit collateral to borrow
    await lidoVault.connect(borrower.signer).depositCollateral(lido.address, depositStETHAmount);
    expect(await lidoVault.getYieldAmount()).to.be.equal(0);

    //To simulate yield in lendingPool, deposit some stETH to aStETH contract
    await lido.connect(signer).transfer(aStETH.address, depositStETHAmount);

    expect((await lidoVault.getYieldAmount()).gt(parseEther('9.999'))).to.be.equal(true);
    expect(await usdc.balanceOf(lidoVault.address)).to.be.equal(0);
    expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);

    // process yield, so all yield should be converted to usdc
    await lidoVault.processYield();
    expect((await aUsdc.balanceOf(depositor.address)).gt(amountUSDCtoDeposit)).to.be.equal(true);
  });
});

makeSuite('LidoVault', (testEnv: TestEnv) => {
  it('move some yield to treasury', async () => {
    const { pool, lidoVault, usdc, users, lido, aUsdc, aStETH } = testEnv;
    const depositor = users[0];
    const borrower = users[1];
    const treasury = users[2];
    const ethers = (DRE as any).ethers;
    const usdcOwnerAddress = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
    const depositUSDC = '7000';
    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    let signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 7000 USDC
    await pool
      .connect(depositor.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

    const stETHOwnerAddress = '0x06920C9fC643De77B99cB7670A944AD31eaAA260';
    const depositStETH = '10';
    const depositStETHAmount = await convertToCurrencyDecimals(lido.address, depositStETH);
    //Make some test stETH for borrower
    await impersonateAccountsHardhat([stETHOwnerAddress]);
    signer = await ethers.provider.getSigner(stETHOwnerAddress);

    //transfer to borrower
    await lido.connect(signer).transfer(borrower.address, depositStETHAmount);

    //approve protocol to access borrower wallet
    await lido.connect(borrower.signer).approve(lidoVault.address, APPROVAL_AMOUNT_LENDING_POOL);

    // deposit collateral to borrow
    await lidoVault.connect(borrower.signer).depositCollateral(lido.address, depositStETHAmount);
    expect(await lidoVault.getYieldAmount()).to.be.equal(0);

    //To simulate yield in lendingPool, deposit some stETH to aStETH contract
    await lido.connect(signer).transfer(aStETH.address, depositStETHAmount);

    expect((await lidoVault.getYieldAmount()).gt(parseEther('9.999'))).to.be.equal(true);
    expect(await usdc.balanceOf(lidoVault.address)).to.be.equal(0);
    expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);
    expect(await lido.balanceOf(treasury.address)).to.be.equal(0);

    // process yield, so all yield should be converted to usdc
    await lidoVault.setTreasuryInfo(treasury.address, '2000');
    await lidoVault.processYield();
    expect((await aUsdc.balanceOf(depositor.address)).gt(amountUSDCtoDeposit)).to.be.equal(true);
    expect(
      (await lido.balanceOf(treasury.address)).gt(depositStETHAmount.mul(19).div(100))
    ).to.be.equal(true);
  });
});
