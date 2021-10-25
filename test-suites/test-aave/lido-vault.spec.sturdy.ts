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
    const { lidoVault, deployer, lido, wstETH, awstETH } = testEnv;
    const beforePooledEther = await lido.getTotalPooledEther();
    await lidoVault.depositCollateral(ZERO_ADDRESS, 0, { value: parseEther('1.1') });
    const currentPooledEther = await lido.getTotalPooledEther();
    expect(currentPooledEther.sub(beforePooledEther)).to.be.equal(parseEther('1.1'));
    expect(await lido.balanceOf(lidoVault.address)).to.be.equal(0);
    expect(await wstETH.balanceOf(lidoVault.address)).to.be.equal(0);
    expect(await awstETH.balanceOf(lidoVault.address)).to.be.equal(0);
    expect((await awstETH.balanceOf(deployer.address)).gt(parseEther('0.9'))).to.be.equal(true);
    expect(await ethers.getDefaultProvider().getBalance(lidoVault.address)).to.be.equal(0);
  });

  it('stETH & aStETH balance check after deposit for collateral', async () => {
    const { lidoVault, deployer, lido, awstETH, wstETH } = testEnv;
    const stETHBalanceOfPool = await lido.balanceOf(lidoVault.address);
    const wstETHBalanceOfPool = await wstETH.balanceOf(lidoVault.address);
    const depositedWstETHBalance = await wstETH.getWstETHByStETH(parseEther('1.1'));
    const aTokensBalance = await awstETH.balanceOf(deployer.address);
    expect(stETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(wstETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(aTokensBalance).to.be.equal(depositedWstETHBalance);
  });

  it('transfering aStETH should be success after deposit ETH', async () => {
    const { awstETH, users } = testEnv;
    await expect(awstETH.transfer(users[0].address, parseEther('0.05'))).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, lidoVault } = testEnv;
    await expect(lidoVault.withdrawCollateral(ZERO_ADDRESS, parseEther('1.2'), deployer.address)).to
      .be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, lido, wstETH, lidoVault } = testEnv;
    const stETHBalanceOfPool = await lido.balanceOf(lidoVault.address);
    const wstETHBalanceOfPool = await wstETH.balanceOf(lidoVault.address);
    const ethBeforeBalanceOfUser = await deployer.signer.getBalance();

    await lidoVault.withdrawCollateral(ZERO_ADDRESS, parseEther('1'), deployer.address);

    const ethCurrentBalanceOfUser = await deployer.signer.getBalance();
    expect(stETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(wstETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(ethCurrentBalanceOfUser.sub(ethBeforeBalanceOfUser).gt(parseEther('0.9'))).to.be.equal(
      true
    );
    expect(await ethers.getDefaultProvider().getBalance(lidoVault.address)).to.be.equal(0);
  });
});

makeSuite('LidoVault - use other coin as collatoral', (testEnv) => {
  it('Should revert to use any of coin other than ETH, stETH as collatoral. ', async () => {
    const { wstETH, usdc, users, lidoVault } = testEnv;
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

    const wstETHOwnerAddress = '0x73d1937bd68a970030b2ffda492860cfb87013c4';
    const depositWstETH = '10';
    //Make some test wstETH for depositor2
    await impersonateAccountsHardhat([wstETHOwnerAddress]);
    signer = await ethers.provider.getSigner(wstETHOwnerAddress);
    await wstETH
      .connect(signer)
      .transfer(depositor2.address, await convertToCurrencyDecimals(wstETH.address, depositWstETH));

    //approve protocol to access depositor wallet
    await wstETH
      .connect(depositor2.signer)
      .approve(lidoVault.address, APPROVAL_AMOUNT_LENDING_POOL);

    //deposits 5 wstETH for collateral
    const amountWstETHtoDeposit = await convertToCurrencyDecimals(wstETH.address, '5');
    await expect(
      lidoVault.connect(depositor2.signer).depositCollateral(wstETH.address, amountWstETHtoDeposit)
    ).to.be.reverted;
  });
});

makeSuite('LidoVault', (testEnv: TestEnv) => {
  it('deposit ETH for collateral', async () => {
    const { lidoVault, usdc, lido, wstETH } = testEnv;
    expect(await lidoVault.getYield()).to.be.equal(0);

    const ethers = (DRE as any).ethers;
    const wstETHOwnerAddress = '0x73d1937bd68a970030b2ffda492860cfb87013c4';
    const depositWstETH = '10';
    const depositWstETHAmount = await convertToCurrencyDecimals(wstETH.address, depositWstETH);
    //Make some test stETH for lidoVault
    await impersonateAccountsHardhat([wstETHOwnerAddress]);
    let signer = await ethers.provider.getSigner(wstETHOwnerAddress);

    //unwrap, wstETH -> stETH
    await wstETH.connect(signer).unwrap(depositWstETHAmount);

    //transfer to vault
    await lido.connect(signer).transfer(lidoVault.address, depositWstETHAmount);
    expect((await lido.balanceOf(lidoVault.address)).gt(parseEther('9.999'))).to.be.equal(true);
    expect((await lidoVault.getYield()).gt(parseEther('9.999'))).to.be.equal(true);
    expect(await usdc.balanceOf(lidoVault.address)).to.be.equal(0);

    // process yield, so all yield should be converted to usdc, estimated min price: 1ETH = 250USDC
    await lidoVault.processYield();
    const minUSDCAmount = await convertToCurrencyDecimals(usdc.address, '2500');
    expect((await usdc.balanceOf(lidoVault.address)).gt(minUSDCAmount)).to.be.equal(true);
  });
});
