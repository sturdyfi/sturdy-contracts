import BigNumber from 'bignumber.js';

import { DRE } from '../../helpers/misc-utils';
import { APPROVAL_AMOUNT_LENDING_POOL, oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite } from './helpers/make-suite';
import { ProtocolErrors, RateMode } from '../../helpers/types';
import { calcExpectedVariableDebtTokenBalance } from './helpers/utils/calculations';
import { getUserData, getReserveData, printUserAccountData, ETHfromWei, printDivider } from './helpers/utils/helpers';

const chai = require('chai');
const { expect } = chai;

makeSuite('LendingPool liquidation - liquidator receiving aToken', (testEnv) => {
  const {
    LPCM_HEALTH_FACTOR_NOT_BELOW_THRESHOLD,
    INVALID_HF,
    LPCM_SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER,
    LPCM_COLLATERAL_CANNOT_BE_LIQUIDATED,
    LP_IS_PAUSED,
  } = ProtocolErrors;
  it('Should revert to use any of coin other than stETH as collatoral. ', async () => {
    const { stETH, dai, usdc, weth, users, pool, oracle } = testEnv;
    const depositor = users[0];
    const depositor2 = users[2];
    const borrower = users[1];
    printDivider()

    //depositor 
    //mints DAI to depositor
    await dai.connect(depositor.signer).mint(await convertToCurrencyDecimals(dai.address, '1000'));

    //approve protocol to access depositor wallet
    await dai.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //user 1 deposits 1000 DAI
    const amountDAItoDeposit = await convertToCurrencyDecimals(dai.address, '1000');
    await pool
      .connect(depositor.signer)
      .deposit(dai.address, amountDAItoDeposit, depositor.address, '0', false);

    const depositor1GlobalData = await pool.getUserAccountData(depositor.address);
    printUserAccountData({ user: `Supplier ${depositor.address}`, action: 'deposits', amount: amountDAItoDeposit, coin: 'DAI', ...depositor1GlobalData })

    //depositor2  deposits 1000 USDC
    //mints USDC to depositor2
    await usdc.connect(depositor2.signer).mint(await convertToCurrencyDecimals(usdc.address, '1000'));

    //approve protocol to access depositor wallet
    await usdc.connect(depositor2.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //depositor2  deposits 1000 usdc
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, '1000');
    await pool
      .connect(depositor2.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor2.address, '0', false);

    const depositor2GlobalData = await pool.getUserAccountData(depositor.address);
    printUserAccountData({ user: `Supplier ${depositor2.address}`, action: 'deposits', amount: amountUSDCtoDeposit, coin: 'USDC', ...depositor2GlobalData })

    //borrower
    const amountStETHtoDeposit = await convertToCurrencyDecimals(stETH.address, '10');

    //mints stETH to borrower
    await stETH.connect(borrower.signer).mint(amountStETHtoDeposit);

    //approve protocol to access borrower wallet
    await stETH.connect(borrower.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);
       
    //user 3 deposits 1 stETH
    await pool
      .connect(borrower.signer)
      .deposit(stETH.address, amountStETHtoDeposit, borrower.address, '0', true);

    const userGlobalData = await pool.getUserAccountData(borrower.address);
    printUserAccountData({ user: `Borrower ${borrower.address}`, action: 'deposits', amount: ETHfromWei(amountStETHtoDeposit), coin: 'stETH', ...userGlobalData })
    
    //depositor2  borrows dai
    const daiPrice = await oracle.getAssetPrice(dai.address);

    const amountDAIToBorrow = await convertToCurrencyDecimals(
      dai.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(daiPrice.toString())
        .multipliedBy(0.95)
        .toFixed(0)
    );

     await expect(pool
      .connect(depositor2.signer)
      .borrow(dai.address, amountDAIToBorrow, RateMode.Variable, '0', depositor2.address)).to.be.reverted;
 
    const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
    printUserAccountData({ user: `Borrower ${depositor2.address}`, action: 'borrows', amount: amountDAIToBorrow, coin: 'DAI', ...userGlobalDataAfter })
    

  });
});
