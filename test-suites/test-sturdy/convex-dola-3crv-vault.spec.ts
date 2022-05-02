/**
 * @dev test for ConvexDOLA3CRVVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { printDivider } from './helpers/utils/helpers';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';

const { parseEther } = ethers.utils;

makeSuite('ConvexDOLA3CRVVault', (testEnv: TestEnv) => {
  it('failed deposit for collateral without ether', async () => {
    const { convexDOLA3CRVVault } = testEnv;

    await expect(convexDOLA3CRVVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.reverted;
  });

  it('deposit DOLA-3CRV for collateral', async () => {
    const { convexDOLA3CRVVault, deployer, cvxdola_3crv, aCVXDOLA_3CRV, DOLA_3CRV_LP } = testEnv;
    const ethers = (DRE as any).ethers;

    // Make some test DOLA_3CRV_LP for depositor
    const amountLPtoDeposit = await convertToCurrencyDecimals(DOLA_3CRV_LP.address, '1.1');
    const LPOwnerAddress = '0x8ed90dc4ef3e52d89da57fff99e6ab53433f2d01';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    await DOLA_3CRV_LP.connect(signer).transfer(deployer.address, amountLPtoDeposit);

    await DOLA_3CRV_LP.connect(deployer.signer).approve(
      convexDOLA3CRVVault.address,
      amountLPtoDeposit
    );

    await convexDOLA3CRVVault
      .connect(deployer.signer)
      .depositCollateral(DOLA_3CRV_LP.address, amountLPtoDeposit);

    expect(await cvxdola_3crv.balanceOf(convexDOLA3CRVVault.address)).to.be.equal(0);
    expect(await aCVXDOLA_3CRV.balanceOf(convexDOLA3CRVVault.address)).to.be.equal(0);
    expect(await aCVXDOLA_3CRV.balanceOf(deployer.address)).to.be.gte(
      await convertToCurrencyDecimals(DOLA_3CRV_LP.address, '1.099')
    );
    expect(await DOLA_3CRV_LP.balanceOf(deployer.address)).to.be.equal(0);
  });

  it('transferring aCVXDOLA_3CRV should be success after deposit DOLA_3CRV_LP', async () => {
    const { aCVXDOLA_3CRV, users } = testEnv;
    await expect(
      aCVXDOLA_3CRV.transfer(
        users[0].address,
        await convertToCurrencyDecimals(aCVXDOLA_3CRV.address, '0.05')
      )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, convexDOLA3CRVVault, DOLA_3CRV_LP } = testEnv;
    const amountLPtoDeposit = await convertToCurrencyDecimals(DOLA_3CRV_LP.address, '1.1');
    await expect(
      convexDOLA3CRVVault.withdrawCollateral(
        DOLA_3CRV_LP.address,
        amountLPtoDeposit,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, cvxdola_3crv, convexDOLA3CRVVault, DOLA_3CRV_LP } = testEnv;
    const dola3crvBalanceOfPool = await cvxdola_3crv.balanceOf(convexDOLA3CRVVault.address);
    const lpBeforeBalanceOfUser = await DOLA_3CRV_LP.balanceOf(deployer.address);
    const amountLPtoWithdraw = await convertToCurrencyDecimals(DOLA_3CRV_LP.address, '1.0499');

    await convexDOLA3CRVVault
      .connect(deployer.signer)
      .withdrawCollateral(DOLA_3CRV_LP.address, amountLPtoWithdraw, deployer.address);

    const lpCurrentBalanceOfUser = await DOLA_3CRV_LP.balanceOf(deployer.address);
    expect(dola3crvBalanceOfPool).to.be.equal(0);
    expect(lpCurrentBalanceOfUser.sub(lpBeforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(DOLA_3CRV_LP.address, '1.049')
    );
    expect(await DOLA_3CRV_LP.balanceOf(convexDOLA3CRVVault.address)).to.be.equal(0);
  });
});

makeSuite('convexDOLA3CRVVault - use other coin as collateral', (testEnv) => {
  it('Should revert to use any of coin other than DOLA3CRV-f as collateral', async () => {
    const { usdc, convexDOLA3CRVVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(convexDOLA3CRVVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith(
      '82'
    );
  });
});

makeSuite('convexDOLA3CRVVault', (testEnv: TestEnv) => {
  it('distribute yield to supplier for single asset', async () => {
    const {
      pool,
      convexDOLA3CRVVault,
      usdc,
      users,
      cvxdola_3crv,
      aUsdc,
      aCVXDOLA_3CRV,
      DOLA_3CRV_LP,
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

    const LPOwnerAddress = '0x8ed90dc4ef3e52d89da57fff99e6ab53433f2d01';
    const depositDOLA3CRV = '3000';
    const depositDOLA3CRVAmount = await convertToCurrencyDecimals(
      DOLA_3CRV_LP.address,
      depositDOLA3CRV
    );
    //Make some test stETH for borrower
    await impersonateAccountsHardhat([LPOwnerAddress]);
    signer = await ethers.provider.getSigner(LPOwnerAddress);

    //transfer to borrower
    await DOLA_3CRV_LP.connect(signer).transfer(borrower.address, depositDOLA3CRVAmount);

    //approve protocol to access borrower wallet
    await DOLA_3CRV_LP.connect(borrower.signer).approve(
      convexDOLA3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexDOLA3CRVVault
      .connect(borrower.signer)
      .depositCollateral(DOLA_3CRV_LP.address, depositDOLA3CRVAmount);
    expect(await convexDOLA3CRVVault.getYieldAmount()).to.be.equal(0);

    //To simulate yield in lendingPool, deposit some cvxDOLA3CRV to aCVXDOLA_3CRV contract
    const cvxDOLA3CRVOwnerAddress = convexDOLA3CRVVault.address;
    const yieldcvxDOLA3CRV = '1000';
    const yieldcvxDOLA3CRVAmount = await convertToCurrencyDecimals(
      cvxdola_3crv.address,
      yieldcvxDOLA3CRV
    );
    //Make some test cvxDOLA3CRV
    await users[2].signer.sendTransaction({
      value: parseEther('10'),
      to: cvxDOLA3CRVOwnerAddress,
    });
    await impersonateAccountsHardhat([cvxDOLA3CRVOwnerAddress]);
    signer = await ethers.provider.getSigner(cvxDOLA3CRVOwnerAddress);
    await cvxdola_3crv.connect(signer).mint(aCVXDOLA_3CRV.address, yieldcvxDOLA3CRVAmount);

    expect(
      (await convexDOLA3CRVVault.getYieldAmount()).gt(
        await convertToCurrencyDecimals(DOLA_3CRV_LP.address, '999.9')
      )
    ).to.be.equal(true);
    expect(await usdc.balanceOf(convexDOLA3CRVVault.address)).to.be.equal(0);
    expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);

    // process yield, so all yield should be converted to usdc
    await convexDOLA3CRVVault.processYield();
    const yieldUSDC = await convertToCurrencyDecimals(usdc.address, '7000');
    expect((await aUsdc.balanceOf(depositor.address)).gt(yieldUSDC)).to.be.equal(true);
  });
});

makeSuite('convexDOLA3CRVVault', (testEnv: TestEnv) => {
  it('distribute yield to supplier for multiple asset', async () => {
    const {
      pool,
      convexDOLA3CRVVault,
      usdc,
      users,
      cvxdola_3crv,
      aUsdc,
      aCVXDOLA_3CRV,
      dai,
      aDai,
      DOLA_3CRV_LP,
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

    const LPOwnerAddress = '0x8ed90dc4ef3e52d89da57fff99e6ab53433f2d01';
    const depositDOLA3CRV = '3000';
    const depositDOLA3CRVAmount = await convertToCurrencyDecimals(
      DOLA_3CRV_LP.address,
      depositDOLA3CRV
    );
    //Make some test stETH for borrower
    await impersonateAccountsHardhat([LPOwnerAddress]);
    signer = await ethers.provider.getSigner(LPOwnerAddress);

    //transfer to borrower
    await DOLA_3CRV_LP.connect(signer).transfer(borrower.address, depositDOLA3CRVAmount);

    //approve protocol to access borrower wallet
    await DOLA_3CRV_LP.connect(borrower.signer).approve(
      convexDOLA3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexDOLA3CRVVault
      .connect(borrower.signer)
      .depositCollateral(DOLA_3CRV_LP.address, depositDOLA3CRVAmount);
    expect(await convexDOLA3CRVVault.getYieldAmount()).to.be.equal(0);

    //To simulate yield in lendingPool, deposit some cvxDOLA3CRV to aCVXDOLA_3CRV contract
    const cvxDOLA3CRVOwnerAddress = convexDOLA3CRVVault.address;
    const yieldcvxDOLA3CRV = '1000';
    const yieldcvxDOLA3CRVAmount = await convertToCurrencyDecimals(
      cvxdola_3crv.address,
      yieldcvxDOLA3CRV
    );
    //Make some test cvxDOLA3CRV
    await users[2].signer.sendTransaction({
      value: parseEther('10'),
      to: cvxDOLA3CRVOwnerAddress,
    });
    await impersonateAccountsHardhat([cvxDOLA3CRVOwnerAddress]);
    signer = await ethers.provider.getSigner(cvxDOLA3CRVOwnerAddress);
    await cvxdola_3crv.connect(signer).mint(aCVXDOLA_3CRV.address, yieldcvxDOLA3CRVAmount);

    expect(
      (await convexDOLA3CRVVault.getYieldAmount()).gt(
        await convertToCurrencyDecimals(cvxdola_3crv.address, '999.9')
      )
    ).to.be.equal(true);
    expect(await usdc.balanceOf(convexDOLA3CRVVault.address)).to.be.equal(0);
    expect(await dai.balanceOf(convexDOLA3CRVVault.address)).to.be.equal(0);
    expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);
    expect(await aDai.balanceOf(other_depositor.address)).to.be.equal(amountDAItoDeposit);

    // process yield, so all yield should be converted to usdc and dai
    await convexDOLA3CRVVault.processYield();
    const yieldUSDC = await convertToCurrencyDecimals(usdc.address, '7000');
    const yieldDAI = await convertToCurrencyDecimals(dai.address, '3500');
    expect((await aUsdc.balanceOf(depositor.address)).gt(yieldUSDC)).to.be.equal(true);
    expect((await aDai.balanceOf(other_depositor.address)).gt(yieldDAI)).to.be.equal(true);
  });
});
