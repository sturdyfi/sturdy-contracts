/**
 * @dev test for MyVault functions
 * @cmd yarn test:assignment
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { getSturdyLendingPool } from '../../helpers/contracts-getters';
import { ethers } from 'ethers';

const { parseEther } = ethers.utils;

makeSuite('SturdyLendingPool Deposit', (testEnv: TestEnv) => {
  it('deposit works', async () => {
    const { deployer, lido } = testEnv;
    const sturdyLendingPool = await getSturdyLendingPool();
    const beforePooledEther = await lido.getTotalPooledEther();
    await sturdyLendingPool.depositETH({ value: parseEther('1') });
    const currentPooledEther = await lido.getTotalPooledEther();
    expect(currentPooledEther.sub(beforePooledEther)).to.be.equal(parseEther('1'));
  });

  it('stETH balance check', async () => {
    const { deployer, lido } = testEnv;
    const sturdyLendingPool = await getSturdyLendingPool();
    const balanceOfVault = await lido.balanceOf(sturdyLendingPool.address);
    expect(balanceOfVault.gt(parseEther('0.9999'))).to.be.equal(true);
  });

  it('withdraw stETH should be failed', async () => {
    const { deployer, lido } = testEnv;
    const sturdyLendingPool = await getSturdyLendingPool();
    const balanceOfVault = await lido.balanceOf(sturdyLendingPool.address);
    await expect(lido.transferFrom(sturdyLendingPool.address, deployer, balanceOfVault)).to.be
      .reverted;
  });

  it('enable withdraw stETH from vault', async () => {
    const { deployer, lido } = testEnv;
    const sturdyLendingPool = await getSturdyLendingPool();
    const beforeBalanceOfVault = await lido.balanceOf(sturdyLendingPool.address);
    await sturdyLendingPool.enableWithdrawStETH();
    await lido.transferFrom(sturdyLendingPool.address, deployer.address, beforeBalanceOfVault);
    const currentBalanceOfVault = await lido.balanceOf(sturdyLendingPool.address);
    const balanceOfUser = await lido.balanceOf(deployer.address);
    expect(currentBalanceOfVault.lt(parseEther('0.0001'))).to.be.equal(true);
    expect(balanceOfUser.gt(parseEther('0.9999'))).to.be.equal(true);
  });
});
