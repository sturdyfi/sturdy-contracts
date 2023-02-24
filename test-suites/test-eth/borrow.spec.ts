import BigNumber from 'bignumber.js';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite } from './helpers/make-suite';
import { RateMode } from '../../helpers/types';
import { printUserAccountData, ETHfromWei, printDivider } from './helpers/utils/helpers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';

const chai = require('chai');
const { expect } = chai;

makeSuite('Deposit ETH_STETH_LP as collateral and other as for pool liquidity supplier ', (testEnv) => {
  it('User1 deposits WETH, User deposits ETH_STETH_LP as collateral and borrows WETH', async () => {
    const { weth, users, pool, convexETHSTETHVault, ETH_STETH_LP, oracle } = testEnv;
    const ethers = (DRE as any).ethers;
    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    const depositor = users[0];
    const borrower = users[1];
    printDivider();
    const depositWETH = '10';
    //Make some test WETH for depositor
    await impersonateAccountsHardhat([wethOwnerAddress]);
    let signer = await ethers.provider.getSigner(wethOwnerAddress);
    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, depositWETH);
    await weth.connect(signer).transfer(depositor.address, amountWETHtoDeposit);

    //approve protocol to access depositor wallet
    await weth.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 10 WETH
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

    //user 2 deposits 10 ETH_STETH_LP
    const ETH_STETH_LPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const amountETH_STETH_LP = await convertToCurrencyDecimals(ETH_STETH_LP.address, '10')
    //Make some test ETH_STETH_LP for depositor
    await impersonateAccountsHardhat([ETH_STETH_LPOwnerAddress]);
    signer = await ethers.provider.getSigner(ETH_STETH_LPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(borrower.address, amountETH_STETH_LP);
    //approve protocol to access depositor wallet
    await ETH_STETH_LP.connect(borrower.signer).approve(convexETHSTETHVault.address, APPROVAL_AMOUNT_LENDING_POOL);

    await convexETHSTETHVault
      .connect(borrower.signer)
      .depositCollateral(ETH_STETH_LP.address, amountETH_STETH_LP);
    {
      const supplierGlobalData = await pool.getUserAccountData(borrower.address);
      printUserAccountData({
        user: `Borrower ${borrower.address}`,
        action: 'deposited',
        amount: ETHfromWei(amountETH_STETH_LP),
        coin: 'ETH_STETH_LP',
        ...supplierGlobalData,
      });
    }

    //user 2 borrows
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const wethPrice = await oracle.getAssetPrice(weth.address);

    const amountWETHToBorrow = await convertToCurrencyDecimals(
      weth.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(wethPrice.toString())
        .multipliedBy(0.95)
        .toFixed(0)
    );

    await pool
      .connect(borrower.signer)
      .borrow(weth.address, amountWETHToBorrow, RateMode.Variable, '0', borrower.address);

    const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
    printUserAccountData({
      user: `Borrower ${borrower.address}`,
      action: 'borrowed',
      amount: amountWETHToBorrow,
      coin: 'WETH',
      ...userGlobalDataAfter,
    });

    expect(userGlobalDataAfter.currentLiquidationThreshold.toString()).to.be.bignumber.equal(
      '9300',
      'Invalid liquidation threshold'
    );
  });
});