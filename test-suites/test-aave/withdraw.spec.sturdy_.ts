import BigNumber from 'bignumber.js';

import { DRE } from '../../helpers/misc-utils';
import { APPROVAL_AMOUNT_LENDING_POOL, oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite } from './helpers/make-suite';
import { ProtocolErrors, RateMode } from '../../helpers/types';
import { calcExpectedVariableDebtTokenBalance } from './helpers/utils/calculations';
import {
  getUserData,
  getReserveData,
  printUserAccountData,
  ETHfromWei,
  printDivider,
} from './helpers/utils/helpers';

const chai = require('chai');
const { expect } = chai;

makeSuite('Deposit stETH as collatoral borrow DAI, Repay ', (testEnv) => {
  const {
    LPCM_HEALTH_FACTOR_NOT_BELOW_THRESHOLD,
    INVALID_HF,
    LPCM_SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER,
    LPCM_COLLATERAL_CANNOT_BE_LIQUIDATED,
    LP_IS_PAUSED,
  } = ProtocolErrors;
  it('User1 deposits DAI, User deposits stETH as collatoral and borrows DAI', async () => {
    const { stETH, dai, weth, users, pool, oracle } = testEnv;
    const depositor = users[0];
    const borrower = users[1];
    printDivider();

    const amountETHtoDeposit = await convertToCurrencyDecimals(stETH.address, '10');

    //mints WETH to borrower
    await stETH.connect(borrower.signer).mint(amountETHtoDeposit);
    //approve protocol to access borrower wallet
    await stETH.connect(borrower.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    await pool
      .connect(borrower.signer)
      .deposit(stETH.address, amountETHtoDeposit, borrower.address, '0', true);

    const supplierGlobalData = await pool.getUserAccountData(borrower.address);
    printUserAccountData({
      user: `Borrower ${borrower.address}`,
      action: 'deposited',
      amount: ETHfromWei(amountETHtoDeposit),
      coin: 'stETH',
      ...supplierGlobalData,
    });

    await pool
      .connect(borrower.signer)
      .withdraw(stETH.address, amountETHtoDeposit, borrower.address);

    const supplierGlobalDataAfter = await pool.getUserAccountData(borrower.address);
    printUserAccountData({
      user: `Borrower ${borrower.address}`,
      action: 'withdrew',
      amount: ETHfromWei(amountETHtoDeposit),
      coin: 'stETH',
      ...supplierGlobalDataAfter,
    });
  });
});
