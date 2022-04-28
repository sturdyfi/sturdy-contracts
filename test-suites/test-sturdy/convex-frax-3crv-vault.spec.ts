/**
 * @dev test for ConvexFRAX3CRVVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { printDivider } from './helpers/utils/helpers';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';

const { parseEther } = ethers.utils;

makeSuite('ConvexFRAX3CRVVault', (testEnv: TestEnv) => {
  it('failed deposit for collateral without ether', async () => {
    const { convexFRAX3CRVVault } = testEnv;

    await expect(convexFRAX3CRVVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.reverted;
  });

  it('deposit FRAX-3CRV for collateral', async () => {
    const { convexFRAX3CRVVault, deployer, cvxfrax_3crv, aCVXFRAX_3CRV, FRAX_3CRV_LP } = testEnv;
    const ethers = (DRE as any).ethers;

    // Make some test FRAX_3CRV_LP for depositor
    const amountFRAX3CRVLPtoDeposit = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '1.1');
    const FRAX3CRVLPOwnerAddress = '0xabc508dda7517f195e416d77c822a4861961947a';
    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(deployer.address, amountFRAX3CRVLPtoDeposit);

    await FRAX_3CRV_LP.connect(deployer.signer).approve(
      convexFRAX3CRVVault.address,
      amountFRAX3CRVLPtoDeposit
    );

    await convexFRAX3CRVVault
      .connect(deployer.signer)
      .depositCollateral(FRAX_3CRV_LP.address, amountFRAX3CRVLPtoDeposit);

    expect(await cvxfrax_3crv.balanceOf(convexFRAX3CRVVault.address)).to.be.equal(0);
    expect(await aCVXFRAX_3CRV.balanceOf(convexFRAX3CRVVault.address)).to.be.equal(0);
    expect(await aCVXFRAX_3CRV.balanceOf(deployer.address)).to.be.gte(
      await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '1.099')
    );
    expect(await FRAX_3CRV_LP.balanceOf(deployer.address)).to.be.equal(0);
  });

  it('transferring aCVXFRAX_3CRV should be success after deposit FRAX_3CRV_LP', async () => {
    const { aCVXFRAX_3CRV, users } = testEnv;
    await expect(
      aCVXFRAX_3CRV.transfer(
        users[0].address,
        await convertToCurrencyDecimals(aCVXFRAX_3CRV.address, '0.05')
      )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, convexFRAX3CRVVault, FRAX_3CRV_LP } = testEnv;
    const amountFRAX3CRVLPtoDeposit = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '1.1');
    await expect(
      convexFRAX3CRVVault.withdrawCollateral(
        FRAX_3CRV_LP.address,
        amountFRAX3CRVLPtoDeposit,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, cvxfrax_3crv, convexFRAX3CRVVault, FRAX_3CRV_LP } = testEnv;
    const frax3crvBalanceOfPool = await cvxfrax_3crv.balanceOf(convexFRAX3CRVVault.address);
    const lpBeforeBalanceOfUser = await FRAX_3CRV_LP.balanceOf(deployer.address);
    const Frax3CrvLPWithdrawAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      '1.0499'
    );

    await convexFRAX3CRVVault
      .connect(deployer.signer)
      .withdrawCollateral(FRAX_3CRV_LP.address, Frax3CrvLPWithdrawAmount, deployer.address);

    const lpCurrentBalanceOfUser = await FRAX_3CRV_LP.balanceOf(deployer.address);
    expect(frax3crvBalanceOfPool).to.be.equal(0);
    expect(lpCurrentBalanceOfUser.sub(lpBeforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '1.049')
    );
    expect(await FRAX_3CRV_LP.balanceOf(convexFRAX3CRVVault.address)).to.be.equal(0);
  });
});

makeSuite('convexFRAX3CRVVault - use other coin as collateral', (testEnv) => {
  it('Should revert to use any of coin other than FRAX3CRV-f as collateral', async () => {
    const { usdc, convexFRAX3CRVVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(convexFRAX3CRVVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith(
      '82'
    );
  });
});

makeSuite('convexFRAX3CRVVault', (testEnv: TestEnv) => {
  it('distribute yield to supplier for single asset', async () => {
    const {
      pool,
      convexFRAX3CRVVault,
      usdc,
      users,
      cvxfrax_3crv,
      aUsdc,
      aCVXFRAX_3CRV,
      FRAX_3CRV_LP,
    } = testEnv;
    const depositor = users[0];
    const borrower = users[1];
    const ethers = (DRE as any).ethers;
    const usdcOwnerAddress = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
    const depositUSDC = '7000';
    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    let signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 7000 USDC
    await pool
      .connect(depositor.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

    const FRAX3CRVLPOwnerAddress = '0xabc508dda7517f195e416d77c822a4861961947a';
    const depositFRAX3CRV = '3000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );
    //Make some test stETH for borrower
    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);

    //transfer to borrower
    await FRAX_3CRV_LP.connect(signer).transfer(borrower.address, depositFRAX3CRVAmount);

    //approve protocol to access borrower wallet
    await FRAX_3CRV_LP.connect(borrower.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexFRAX3CRVVault
      .connect(borrower.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);
    expect(await convexFRAX3CRVVault.getYieldAmount()).to.be.equal(0);

    //To simulate yield in lendingPool, deposit some cvxFRAX3CRV to aCVXFRAX_3CRV contract
    const cvxFRAX3CRVOwnerAddress = convexFRAX3CRVVault.address;
    const yieldcvxFRAX3CRV = '1000';
    const yieldcvxFRAX3CRVAmount = await convertToCurrencyDecimals(
      cvxfrax_3crv.address,
      yieldcvxFRAX3CRV
    );
    //Make some test cvxFRAX3CRV
    await users[2].signer.sendTransaction({
      value: parseEther('10'),
      to: cvxFRAX3CRVOwnerAddress,
    });
    await impersonateAccountsHardhat([cvxFRAX3CRVOwnerAddress]);
    signer = await ethers.provider.getSigner(cvxFRAX3CRVOwnerAddress);
    await cvxfrax_3crv.connect(signer).mint(aCVXFRAX_3CRV.address, yieldcvxFRAX3CRVAmount);

    expect(
      (await convexFRAX3CRVVault.getYieldAmount()).gt(
        await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '999.9')
      )
    ).to.be.equal(true);
    expect(await usdc.balanceOf(convexFRAX3CRVVault.address)).to.be.equal(0);
    expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);

    // process yield, so all yield should be converted to usdc
    await convexFRAX3CRVVault.processYield();
    const yieldUSDC = await convertToCurrencyDecimals(usdc.address, '7000');
    expect((await aUsdc.balanceOf(depositor.address)).gt(yieldUSDC)).to.be.equal(true);
  });
});

makeSuite('convexFRAX3CRVVault', (testEnv: TestEnv) => {
  it('distribute yield to supplier for multiple asset', async () => {
    const {
      pool,
      convexFRAX3CRVVault,
      usdc,
      users,
      cvxfrax_3crv,
      aUsdc,
      aCVXFRAX_3CRV,
      dai,
      aDai,
      FRAX_3CRV_LP,
    } = testEnv;
    const depositor = users[0];
    const other_depositor = users[1];
    const borrower = users[2];
    const ethers = (DRE as any).ethers;
    const usdcOwnerAddress = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
    const depositUSDC = '7000';
    //Make some test USDC for depositor
    await impersonateAccountsHardhat([usdcOwnerAddress]);
    let signer = await ethers.provider.getSigner(usdcOwnerAddress);
    const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
    await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

    //approve protocol to access depositor wallet
    await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 7000 USDC
    await pool
      .connect(depositor.signer)
      .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

    const daiOwnerAddress = '0x4967ec98748efb98490663a65b16698069a1eb35';
    const depositDAI = '3500';
    //Make some test DAI for depositor
    await impersonateAccountsHardhat([daiOwnerAddress]);
    signer = await ethers.provider.getSigner(daiOwnerAddress);
    const amountDAItoDeposit = await convertToCurrencyDecimals(dai.address, depositDAI);
    await dai.connect(signer).transfer(other_depositor.address, amountDAItoDeposit);

    //approve protocol to access depositor wallet
    await dai.connect(other_depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    //Supplier  deposits 3500 DAI
    await pool
      .connect(other_depositor.signer)
      .deposit(dai.address, amountDAItoDeposit, other_depositor.address, '0');

    const FRAX3CRVLPOwnerAddress = '0xabc508dda7517f195e416d77c822a4861961947a';
    const depositFRAX3CRV = '3000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );
    //Make some test stETH for borrower
    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);

    //transfer to borrower
    await FRAX_3CRV_LP.connect(signer).transfer(borrower.address, depositFRAX3CRVAmount);

    //approve protocol to access borrower wallet
    await FRAX_3CRV_LP.connect(borrower.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexFRAX3CRVVault
      .connect(borrower.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);
    expect(await convexFRAX3CRVVault.getYieldAmount()).to.be.equal(0);

    //To simulate yield in lendingPool, deposit some cvxFRAX3CRV to aCVXFRAX_3CRV contract
    const cvxFRAX3CRVOwnerAddress = convexFRAX3CRVVault.address;
    const yieldcvxFRAX3CRV = '1000';
    const yieldcvxFRAX3CRVAmount = await convertToCurrencyDecimals(
      cvxfrax_3crv.address,
      yieldcvxFRAX3CRV
    );
    //Make some test cvxFRAX3CRV
    await users[2].signer.sendTransaction({
      value: parseEther('10'),
      to: cvxFRAX3CRVOwnerAddress,
    });
    await impersonateAccountsHardhat([cvxFRAX3CRVOwnerAddress]);
    signer = await ethers.provider.getSigner(cvxFRAX3CRVOwnerAddress);
    await cvxfrax_3crv.connect(signer).mint(aCVXFRAX_3CRV.address, yieldcvxFRAX3CRVAmount);

    expect(
      (await convexFRAX3CRVVault.getYieldAmount()).gt(
        await convertToCurrencyDecimals(cvxfrax_3crv.address, '999.9')
      )
    ).to.be.equal(true);
    expect(await usdc.balanceOf(convexFRAX3CRVVault.address)).to.be.equal(0);
    expect(await dai.balanceOf(convexFRAX3CRVVault.address)).to.be.equal(0);
    expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);
    expect(await aDai.balanceOf(other_depositor.address)).to.be.equal(amountDAItoDeposit);

    // process yield, so all yield should be converted to usdc and dai
    await convexFRAX3CRVVault.processYield();
    const yieldUSDC = await convertToCurrencyDecimals(usdc.address, '7000');
    const yieldDAI = await convertToCurrencyDecimals(dai.address, '3500');
    expect((await aUsdc.balanceOf(depositor.address)).gt(yieldUSDC)).to.be.equal(true);
    expect((await aDai.balanceOf(other_depositor.address)).gt(yieldDAI)).to.be.equal(true);
  });
});
