import BigNumber from 'bignumber.js';
import { APPROVAL_AMOUNT_LENDING_POOL } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite } from './helpers/make-suite';
import { RateMode } from '../../helpers/types';
import { printUserAccountData, ETHfromWei, printDivider } from './helpers/utils/helpers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';

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

makeSuite('borrow stETH', (testEnv) => {
  it('Should revert if borrow wstETH. User1 cant deposits wstETH, User2 deposits wstETH as collatoral and borrows wstETH', async () => {
    const { wstETH, users, pool, oracle } = testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    printDivider();
    const wstETHOwnerAddress = '0x73d1937bd68a970030b2ffda492860cfb87013c4';
    const depositWstETH = '10';
    //Make some test wstETH for depositor
    await impersonateAccountsHardhat([wstETHOwnerAddress]);
    const signer = await ethers.provider.getSigner(wstETHOwnerAddress);
    await wstETH
      .connect(signer)
      .transfer(depositor.address, ethers.utils.parseEther(depositWstETH));

    //approve protocol to access depositor wallet
    await wstETH.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //user 1 deposits 5 wstETH
    const amountWstETHtoDeposit = await convertToCurrencyDecimals(wstETH.address, '5');

    await expect(
      pool
        .connect(depositor.signer)
        .deposit(wstETH.address, amountWstETHtoDeposit, depositor.address, '0')
    ).to.be.reverted;

    //Make 5ETH deposit for collatoral
    await pool
      .connect(borrower.signer)
      .depositForCollateral({ value: ethers.utils.parseEther('5') });

    const borrowerGlobalData = await pool.getUserAccountData(borrower.address);
    printUserAccountData({
      user: `Borrower ${borrower.address}`,
      action: 'deposits',
      amount: 5,
      coin: 'swtETH',
      ...borrowerGlobalData,
    });
    //user 2 borrows

    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const wstETHPrice = await oracle.getAssetPrice(wstETH.address);

    const amountWstETHToBorrow = await convertToCurrencyDecimals(
      wstETH.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(wstETHPrice.toString())
        .multipliedBy(0.95)
        .toFixed(0)
    );
    await expect(
      pool
        .connect(borrower.signer)
        .borrow(wstETH.address, amountWstETHToBorrow, RateMode.Stable, '0', borrower.address)
    ).to.be.reverted;
  });
});

makeSuite('LendingPool liquidation - liquidator receiving aToken', (testEnv) => {
  it('Should revert to use any of coin other than ETH as collatoral. ', async () => {
    const { dai, usdc, users, pool, oracle } = testEnv;
    const ethers = (DRE as any).ethers;
    const daiOwnerAddress = '0xC2c7D100d234D23cd7233066a5FEE97f56DB171C';
    const usdcOwnerAddress = '0x60CD9BAe8BDe62cC08681138C028eab5B368C31B';
    const depositor = users[0];
    const depositor2 = users[1];
    printDivider();

    //depositor
    //Make some test DAI for depositor
    await impersonateAccountsHardhat([daiOwnerAddress]);
    let signer = await ethers.provider.getSigner(daiOwnerAddress);
    const amountDAItoDeposit = await convertToCurrencyDecimals(dai.address, '1000');
    await dai.connect(signer).transfer(depositor.address, amountDAItoDeposit);

    //approve protocol to access depositor wallet
    await dai.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //user 1 deposits 1000 DAI
    await pool
      .connect(depositor.signer)
      .deposit(dai.address, amountDAItoDeposit, depositor.address, '0');

    const depositor1GlobalData = await pool.getUserAccountData(depositor.address);
    printUserAccountData({
      user: `Supplier ${depositor.address}`,
      action: 'deposits',
      amount: amountDAItoDeposit,
      coin: 'DAI',
      ...depositor1GlobalData,
    });

    //Make some test USDC for depositor2
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, '1000');
    await depositor2.signer.sendTransaction({
      to: usdcOwnerAddress,
      value: ethers.utils.parseUnits('1', 'ether').toHexString(),
    });
    await usdc.connect(signer).transfer(depositor2.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor2.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //depositor2  deposits 1000 usdc
    await pool
      .connect(depositor2.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor2.address, '0');

    const depositor2GlobalData = await pool.getUserAccountData(depositor2.address);
    printUserAccountData({
      user: `Supplier ${depositor2.address}`,
      action: 'deposits',
      amount: amountUSDCtoDeposit,
      coin: 'USDC',
      ...depositor2GlobalData,
    });

    //depositor2  borrows dai
    const daiPrice = await oracle.getAssetPrice(dai.address);

    const amountDAIToBorrow = await convertToCurrencyDecimals(
      dai.address,
      new BigNumber(depositor2GlobalData.availableBorrowsETH.toString())
        .div(daiPrice.toString())
        .multipliedBy(0.95)
        .toFixed(0)
    );

    await expect(
      pool
        .connect(depositor2.signer)
        .borrow(dai.address, amountDAIToBorrow, RateMode.Variable, '0', depositor2.address)
    ).to.be.reverted;
  });
});
