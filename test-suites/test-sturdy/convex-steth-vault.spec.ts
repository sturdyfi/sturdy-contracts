/**
 * @dev test for ConvexSTETHVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { printDivider } from './helpers/utils/helpers';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';

const { parseEther } = ethers.utils;

makeSuite('ConvexSTETHVault', (testEnv: TestEnv) => {
  it('failed deposit for collateral without ether', async () => {
    const { convexSTETHVault } = testEnv;

    await expect(convexSTETHVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.reverted;
  });

  it('deposit steCRV for collateral', async () => {
    const { convexSTETHVault, deployer, cvxstecrv, aCVXSTECRV, STECRV_LP } = testEnv;
    const ethers = (DRE as any).ethers;

    // Make some test STECRV_LP for depositor
    const amountLPtoDeposit = await convertToCurrencyDecimals(STECRV_LP.address, '1.1');
    const steCRVLPOwnerAddress = '0x4a03cbfd9bc2d3d1345adbf461f2dee03e64e9d3';
    await impersonateAccountsHardhat([steCRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(steCRVLPOwnerAddress);
    await STECRV_LP.connect(signer).transfer(deployer.address, amountLPtoDeposit);

    await STECRV_LP.connect(deployer.signer).approve(convexSTETHVault.address, amountLPtoDeposit);

    await convexSTETHVault
      .connect(deployer.signer)
      .depositCollateral(STECRV_LP.address, amountLPtoDeposit);

    expect(await cvxstecrv.balanceOf(convexSTETHVault.address)).to.be.equal(0);
    expect(await aCVXSTECRV.balanceOf(convexSTETHVault.address)).to.be.equal(0);
    expect(await aCVXSTECRV.balanceOf(deployer.address)).to.be.gte(
      await convertToCurrencyDecimals(STECRV_LP.address, '1.099')
    );
    expect(await STECRV_LP.balanceOf(deployer.address)).to.be.equal(0);
  });

  it('transferring aCVXSTECRV should be success after deposit LP', async () => {
    const { aCVXSTECRV, users } = testEnv;
    await expect(
      aCVXSTECRV.transfer(
        users[0].address,
        await convertToCurrencyDecimals(aCVXSTECRV.address, '0.05')
      )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, convexSTETHVault, STECRV_LP } = testEnv;
    const amountLPtoDeposit = await convertToCurrencyDecimals(STECRV_LP.address, '1.1');
    await expect(
      convexSTETHVault.withdrawCollateral(STECRV_LP.address, amountLPtoDeposit, deployer.address)
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, cvxstecrv, convexSTETHVault, STECRV_LP } = testEnv;
    const lpBalanceOfPool = await cvxstecrv.balanceOf(convexSTETHVault.address);
    const collateralBalanceOfUser = await STECRV_LP.balanceOf(deployer.address);
    const lpWithdrawAmount = await convertToCurrencyDecimals(STECRV_LP.address, '1.0499');

    await convexSTETHVault
      .connect(deployer.signer)
      .withdrawCollateral(STECRV_LP.address, lpWithdrawAmount, deployer.address);

    const collateralCurrentBalanceOfUser = await STECRV_LP.balanceOf(deployer.address);
    expect(lpBalanceOfPool).to.be.equal(0);
    expect(collateralCurrentBalanceOfUser.sub(collateralBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(STECRV_LP.address, '1.049')
    );
    expect(await STECRV_LP.balanceOf(convexSTETHVault.address)).to.be.equal(0);
  });
});

makeSuite('convexSTETHVault - use other coin as collateral', (testEnv) => {
  it('Should revert to use any of coin other than steCRV as collateral', async () => {
    const { usdc, convexSTETHVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(convexSTETHVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith('82');
  });
});

makeSuite('convexSTETHVault', (testEnv: TestEnv) => {
  it('distribute yield to supplier for single asset', async () => {
    const { pool, convexSTETHVault, usdc, users, cvxstecrv, aUsdc, aCVXSTECRV, STECRV_LP } =
      testEnv;
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

    const steCRVLPOwnerAddress = '0x4a03cbfd9bc2d3d1345adbf461f2dee03e64e9d3';
    const depositLP = '1.5';
    const depositLPAmount = await convertToCurrencyDecimals(STECRV_LP.address, depositLP);
    //Make some test stETH for borrower
    await impersonateAccountsHardhat([steCRVLPOwnerAddress]);
    signer = await ethers.provider.getSigner(steCRVLPOwnerAddress);

    //transfer to borrower
    await STECRV_LP.connect(signer).transfer(borrower.address, depositLPAmount);

    //approve protocol to access borrower wallet
    await STECRV_LP.connect(borrower.signer).approve(
      convexSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexSTETHVault
      .connect(borrower.signer)
      .depositCollateral(STECRV_LP.address, depositLPAmount);
    expect(await convexSTETHVault.getYieldAmount()).to.be.equal(0);

    //To simulate yield in lendingPool, deposit some cvxSTECRV to aCVXSTECRV contract
    const cvxSTECRVOwnerAddress = convexSTETHVault.address;
    const yieldcvxSTECRV = '1';
    const yieldCvxSTECRVAmount = await convertToCurrencyDecimals(cvxstecrv.address, yieldcvxSTECRV);
    //Make some test cvxSTECRV
    await users[2].signer.sendTransaction({
      value: parseEther('10'),
      to: cvxSTECRVOwnerAddress,
    });
    await impersonateAccountsHardhat([cvxSTECRVOwnerAddress]);
    signer = await ethers.provider.getSigner(cvxSTECRVOwnerAddress);
    await cvxstecrv.connect(signer).mint(aCVXSTECRV.address, yieldCvxSTECRVAmount);

    expect(
      (await convexSTETHVault.getYieldAmount()).gt(
        await convertToCurrencyDecimals(STECRV_LP.address, '0.99')
      )
    ).to.be.equal(true);
    expect(await usdc.balanceOf(convexSTETHVault.address)).to.be.equal(0);
    expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);

    // process yield, so all yield should be converted to usdc
    await convexSTETHVault.processYield();
    const yieldUSDC = await convertToCurrencyDecimals(usdc.address, '7000');
    expect((await aUsdc.balanceOf(depositor.address)).gt(yieldUSDC)).to.be.equal(true);
  });
});

makeSuite('convexSTETHVault', (testEnv: TestEnv) => {
  it('distribute yield to supplier for multiple asset', async () => {
    const {
      pool,
      convexSTETHVault,
      usdc,
      users,
      cvxstecrv,
      aUsdc,
      aCVXSTECRV,
      dai,
      aDai,
      STECRV_LP,
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

    const steCRVLPOwnerAddress = '0x4a03cbfd9bc2d3d1345adbf461f2dee03e64e9d3';
    const depositLP = '1.5';
    const depositLPAmount = await convertToCurrencyDecimals(STECRV_LP.address, depositLP);
    //Make some test stETH for borrower
    await impersonateAccountsHardhat([steCRVLPOwnerAddress]);
    signer = await ethers.provider.getSigner(steCRVLPOwnerAddress);

    //transfer to borrower
    await STECRV_LP.connect(signer).transfer(borrower.address, depositLPAmount);

    //approve protocol to access borrower wallet
    await STECRV_LP.connect(borrower.signer).approve(
      convexSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexSTETHVault
      .connect(borrower.signer)
      .depositCollateral(STECRV_LP.address, depositLPAmount);
    expect(await convexSTETHVault.getYieldAmount()).to.be.equal(0);

    //To simulate yield in lendingPool, deposit some cvxSTECRV to aCVXSTECRV contract
    const cvxSTECRVOwnerAddress = convexSTETHVault.address;
    const yieldcvxSTECRV = '1';
    const yieldCvxSTECRVAmount = await convertToCurrencyDecimals(cvxstecrv.address, yieldcvxSTECRV);
    //Make some test cvxSTECRV
    await users[2].signer.sendTransaction({
      value: parseEther('10'),
      to: cvxSTECRVOwnerAddress,
    });
    await impersonateAccountsHardhat([cvxSTECRVOwnerAddress]);
    signer = await ethers.provider.getSigner(cvxSTECRVOwnerAddress);
    await cvxstecrv.connect(signer).mint(aCVXSTECRV.address, yieldCvxSTECRVAmount);

    expect(
      (await convexSTETHVault.getYieldAmount()).gt(
        await convertToCurrencyDecimals(cvxstecrv.address, '0.99')
      )
    ).to.be.equal(true);
    expect(await usdc.balanceOf(convexSTETHVault.address)).to.be.equal(0);
    expect(await dai.balanceOf(convexSTETHVault.address)).to.be.equal(0);
    expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);
    expect(await aDai.balanceOf(other_depositor.address)).to.be.equal(amountDAItoDeposit);

    // process yield, so all yield should be converted to usdc and dai
    await convexSTETHVault.processYield();
    const yieldUSDC = await convertToCurrencyDecimals(usdc.address, '7000');
    const yieldDAI = await convertToCurrencyDecimals(dai.address, '3500');
    expect((await aUsdc.balanceOf(depositor.address)).gt(yieldUSDC)).to.be.equal(true);
    expect((await aDai.balanceOf(other_depositor.address)).gt(yieldDAI)).to.be.equal(true);
  });
});
