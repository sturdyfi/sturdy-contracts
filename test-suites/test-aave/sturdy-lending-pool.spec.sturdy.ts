/**
 * @dev test for MyVault functions
 * @cmd yarn test:assignment
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { getSturdyLendingPool } from '../../helpers/contracts-getters';
import { ethers } from 'ethers';

const { parseEther } = ethers.utils;

makeSuite('SturdyLendingPool', (testEnv: TestEnv) => {
  it('failed deposit for collateral without ether', async () => {
    const { pool } = testEnv;
    await expect(pool.depositForCollateral()).to.be.reverted;
  });

  it('deposit ETH for collateral', async () => {
    const { pool, deployer, lido, wstETH, awstETH } = testEnv;
    const beforePooledEther = await lido.getTotalPooledEther();
    await pool.depositForCollateral({ value: parseEther('1.1') });
    const currentPooledEther = await lido.getTotalPooledEther();
    const balanceOfUser = await pool.balanceOfETH(deployer.address);
    expect(currentPooledEther.sub(beforePooledEther)).to.be.equal(parseEther('1.1'));
    expect(balanceOfUser).to.be.equal(parseEther('1.1'));
    expect(await lido.balanceOf(pool.address)).to.be.equal(0);
    expect(await wstETH.balanceOf(pool.address)).to.be.equal(0);
    expect(await awstETH.balanceOf(pool.address)).to.be.equal(0);
    expect((await awstETH.balanceOf(deployer.address)).gt(parseEther('0.9'))).to.be.equal(true);
    expect(await ethers.getDefaultProvider().getBalance(pool.address)).to.be.equal(0);
  });

  it('stETH & aStETH balance check after deposit for collateral', async () => {
    const { pool, deployer, lido, awstETH, wstETH } = testEnv;
    const stETHBalanceOfPool = await lido.balanceOf(pool.address);
    const wstETHBalanceOfPool = await wstETH.balanceOf(pool.address);
    const depositedWstETHBalance = await wstETH.getWstETHByStETH(parseEther('1.1'));
    const aTokensBalance = await awstETH.balanceOf(deployer.address);
    expect(stETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(wstETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(aTokensBalance).to.be.equal(depositedWstETHBalance);
  });

  it('transfering aStETH should be success after deposit ETH', async () => {
    const { awstETH, deployer, users } = testEnv;
    await expect(awstETH.transfer(users[0].address, parseEther('0.05'))).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, pool } = testEnv;
    await expect(pool.withdrawFromCollateral(parseEther('1.2'), deployer.address)).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, lido, wstETH, pool } = testEnv;
    const stETHBalanceOfPool = await lido.balanceOf(pool.address);
    const wstETHBalanceOfPool = await wstETH.balanceOf(pool.address);
    const beforStETHbalanceOfUser = await pool.balanceOfETH(deployer.address);
    const ethBeforeBalanceOfUser = await deployer.signer.getBalance();

    await pool.withdrawFromCollateral(parseEther('1'), deployer.address);

    const currentStETHbalanceOfUser = await pool.balanceOfETH(deployer.address);
    const ethCurrentBalanceOfUser = await deployer.signer.getBalance();
    expect(stETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(wstETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(beforStETHbalanceOfUser.gt(parseEther('0.9999'))).to.be.equal(true);
    expect(currentStETHbalanceOfUser.lt(parseEther('0.1001'))).to.be.equal(true);
    expect(ethCurrentBalanceOfUser.sub(ethBeforeBalanceOfUser).gt(parseEther('0.9'))).to.be.equal(
      true
    );
    expect(await ethers.getDefaultProvider().getBalance(pool.address)).to.be.equal(0);
  });
});
