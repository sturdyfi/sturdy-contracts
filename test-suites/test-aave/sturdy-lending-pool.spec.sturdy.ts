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
  it('deposit for collateral', async () => {
    const { deployer, lido } = testEnv;
    const sturdyLendingPool = await getSturdyLendingPool();
    const beforePooledEther = await lido.getTotalPooledEther();
    await sturdyLendingPool.depositForCollateral({ value: parseEther('1') });
    const currentPooledEther = await lido.getTotalPooledEther();
    const balanceOfUser = await sturdyLendingPool.balanceOfETH(deployer.address);
    expect(currentPooledEther.sub(beforePooledEther)).to.be.equal(parseEther('1'));
    expect(balanceOfUser).to.be.equal(parseEther('1'));
  });

  it('stETH & aStETH balance check after deposit for collateral', async () => {
    const { lido, awstETH, wstETH } = testEnv;
    const sturdyLendingPool = await getSturdyLendingPool();
    const stETHBalanceOfPool = await lido.balanceOf(sturdyLendingPool.address);
    const wstETHBalanceOfPool = await wstETH.balanceOf(sturdyLendingPool.address);
    const depositedWstETHBalance = await wstETH.getWstETHByStETH(parseEther('1'));
    const aTokensBalance = await awstETH.balanceOf(sturdyLendingPool.address);
    expect(stETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(wstETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(aTokensBalance).to.be.equal(depositedWstETHBalance);
  });

  // it('withdraw stETH should be failed', async () => {
  //   const { deployer, lido } = testEnv;
  //   const sturdyLendingPool = await getSturdyLendingPool();
  //   const balanceOfVault = await lido.balanceOf(sturdyLendingPool.address);
  //   await expect(lido.transferFrom(sturdyLendingPool.address, deployer, balanceOfVault)).to.be
  //     .reverted;
  // });

  it('withdraw from collateral', async () => {
    const { deployer, lido, wstETH } = testEnv;
    const sturdyLendingPool = await getSturdyLendingPool();
    const stETHBalanceOfPool = await lido.balanceOf(sturdyLendingPool.address);
    const wstETHBalanceOfPool = await wstETH.balanceOf(sturdyLendingPool.address);
    const beforStETHbalanceOfUser = await sturdyLendingPool.balanceOfETH(deployer.address);
    const ethBeforeBalanceOfUser = await deployer.signer.getBalance();

    await sturdyLendingPool.withdrawFromCollateral(parseEther('1'), deployer.address);

    const currentStETHbalanceOfUser = await sturdyLendingPool.balanceOfETH(deployer.address);
    const ethCurrentBalanceOfUser = await deployer.signer.getBalance();
    expect(stETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(wstETHBalanceOfPool.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(beforStETHbalanceOfUser.gt(parseEther('0.9999'))).to.be.equal(true);
    expect(currentStETHbalanceOfUser.lt(parseEther('0.0001'))).to.be.equal(true);
    // expect(
    //   ethCurrentBalanceOfUser
    //   .sub(ethBeforeBalanceOfUser)
    //   .gt(parseEther('0.9'))
    // ).to.be.equal(true);                                                         //ToDo: need to enable after curve binding
    // expect(currentBalanceOfVault.lt(parseEther('0.0001'))).to.be.equal(true);    //ToDo: need to enable after curve binding
  });
});
