import BigNumber from 'bignumber.js';
import { APPROVAL_AMOUNT_LENDING_POOL } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite } from './helpers/make-suite';
import { RateMode } from '../../helpers/types';
import { printUserAccountData, ETHfromWei, printDivider } from './helpers/utils/helpers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { getSturdyLendingPool } from '../../helpers/contracts-getters';

const chai = require('chai');
const { expect } = chai;

makeSuite('Deposit ETH as collatoral and other as for pool liquidity supplier ', (testEnv) => {
  it('User1 deposits DAI, User deposits ETH as collatoral and borrows DAI', async () => {
    const { wstETH, dai, users, pool, oracle } = testEnv;
    const ethers = (DRE as any).ethers;
    const daiOwnerAddress = '0xC2c7D100d234D23cd7233066a5FEE97f56DB171C';
    const depositor = users[0];
    const borrower = users[1];
    printDivider();
    const depositDai = '7000';
    //Make some test DAI for depositor
    await impersonateAccountsHardhat([daiOwnerAddress]);
    const signer = await ethers.provider.getSigner(daiOwnerAddress);
    await dai.connect(signer).transfer(depositor.address, ethers.utils.parseEther(depositDai));

    //approve protocol to access depositor wallet
    await dai.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 7000 DAI
    const amountDAItoDeposit = await convertToCurrencyDecimals(dai.address, depositDai);
    await pool
      .connect(depositor.signer)
      .deposit(dai.address, amountDAItoDeposit, depositor.address, '0');

    const supplierGlobalData = await pool.getUserAccountData(depositor.address);
    printUserAccountData({
      user: `Supplier ${depositor.address}`,
      action: 'deposited',
      amount: depositDai,
      coin: 'DAI',
      ...supplierGlobalData,
    });

    //user 2 deposits 4 ETH
    const amountETHtoDeposit = ethers.utils.parseEther('4');
    await pool.connect(borrower.signer).depositForCollateral({ value: amountETHtoDeposit });
    {
      console.log(pool.address);
      const supplierGlobalData = await pool.getUserAccountData(borrower.address);
      printUserAccountData({
        user: `Borrower ${borrower.address}`,
        action: 'deposited',
        amount: ETHfromWei(amountETHtoDeposit),
        coin: 'wstETH',
        ...supplierGlobalData,
      });
    }

    //user 2 borrows
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const daiPrice = await oracle.getAssetPrice(dai.address);

    const amountDAIToBorrow = await convertToCurrencyDecimals(
      dai.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(daiPrice.toString())
        .multipliedBy(0.95)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(dai.address, amountDAIToBorrow, RateMode.Variable, '0', borrower.address);

    const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
    printUserAccountData({
      user: `Borrower ${borrower.address}`,
      action: 'borrowed',
      amount: amountDAIToBorrow,
      coin: 'Dai',
      ...userGlobalDataAfter,
    });

    expect(userGlobalDataAfter.currentLiquidationThreshold.toString()).to.be.bignumber.equal(
      '6500',
      'Invalid liquidation threshold'
    );
  });
});
