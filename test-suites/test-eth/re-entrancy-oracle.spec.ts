/**
 * @dev test for ConvexETHSTETHVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { mint } from './helpers/mint';
import { ReEntrancyTest, ReEntrancyTestFactory } from '../../types';
import { getFirstSigner } from '../../helpers/contracts-getters';

makeSuite('ReEntrancy Oracle Test - if check is disabled, re-entrancy attack would be success', (testEnv: TestEnv) => {
  let testContract = {} as ReEntrancyTest;

  before(async () => {
    testContract = await new ReEntrancyTestFactory(await getFirstSigner()).deploy();
  });

  it('Curve ETH_STETH LP Token Price', async () => {
    const { users, weth, ETH_STETH_LP } = testEnv;
    const user = users[2];
    const collateralAmount = (
      await convertToCurrencyDecimals(ETH_STETH_LP.address, '10')
    ).toString();
    await mint('ETH_STETH_LP', collateralAmount, user);

    const wethAmount = (
      await convertToCurrencyDecimals(weth.address, '10')
    ).toString();
    await mint('WETH', wethAmount, user);

    await ETH_STETH_LP.connect(user.signer).transfer(testContract.address, collateralAmount);
    await weth.connect(user.signer).transfer(testContract.address, wethAmount);

    await expect(testContract.test()).to.not.be.reverted;
  });
});

makeSuite('ReEntrancy Oracle Test - if check is enabled, re-entrancy attack would be failed', (testEnv: TestEnv) => {
  let testContract = {} as ReEntrancyTest;

  before(async () => {
    testContract = await new ReEntrancyTestFactory(await getFirstSigner()).deploy();
  });

  it('Curve ETH_STETH LP Token Price', async () => {
    const { users, weth, ETH_STETH_LP } = testEnv;
    const user = users[2];
    const collateralAmount = (
      await convertToCurrencyDecimals(ETH_STETH_LP.address, '10')
    ).toString();
    await mint('ETH_STETH_LP', collateralAmount, user);

    const wethAmount = (
      await convertToCurrencyDecimals(weth.address, '10')
    ).toString();
    await mint('WETH', wethAmount, user);

    await ETH_STETH_LP.connect(user.signer).transfer(testContract.address, collateralAmount);
    await weth.connect(user.signer).transfer(testContract.address, wethAmount);
    
    await testContract.enableCheck();

    await expect(testContract.test()).to.be.reverted;
  });
});