import BigNumber from 'bignumber.js';

import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { APPROVAL_AMOUNT_LENDING_POOL } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite } from './helpers/make-suite';
import { printUserAccountData, printDivider } from './helpers/utils/helpers';

const chai = require('chai');
const { expect } = chai;

makeSuite('Withdraw WETH ', (testEnv) => {
  it('User1 deposits WETH and then withdraw WETH', async () => {
    const { weth, users, pool, oracle } = testEnv;
    const ethers = (DRE as any).ethers;
    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    const depositor = users[0];
    printDivider();
    const depositWETH = '2';
    //Make some test WETH for depositor
    await impersonateAccountsHardhat([wethOwnerAddress]);
    const signer = await ethers.provider.getSigner(wethOwnerAddress);
    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, depositWETH);
    await weth.connect(signer).transfer(depositor.address, amountWETHtoDeposit);

    //approve protocol to access depositor wallet
    await weth.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 2 WETH
    await pool
      .connect(depositor.signer)
      .deposit(weth.address, amountWETHtoDeposit, depositor.address, '0');

    const supplierGlobalData = await pool.getUserAccountData(depositor.address);
    printUserAccountData({
      user: `Supplier ${depositor.address}`,
      action: 'deposited',
      amount: depositWETH,
      coin: 'WETH',
      ...supplierGlobalData,
    });

    await pool
      .connect(depositor.signer)
      .withdraw(weth.address, amountWETHtoDeposit, depositor.address);

    const userGlobalDataAfter = await pool.getUserAccountData(depositor.address);
    printUserAccountData({
      user: `Supplier ${depositor.address}`,
      action: 'withdraw',
      amount: amountWETHtoDeposit,
      coin: 'WETH',
      ...userGlobalDataAfter,
    });
  });
});
