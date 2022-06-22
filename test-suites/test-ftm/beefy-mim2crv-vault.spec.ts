/**
 * @dev test for BeefyMIM2CRVVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';

const { parseEther } = ethers.utils;

makeSuite('BeefyMIM2CRVVault', (testEnv: TestEnv) => {
  it('failed deposit for collateral without MIM_2CRV', async () => {
    const { beefyMIM2CRVVault } = testEnv;
    await expect(beefyMIM2CRVVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.reverted;
  });

  it('deposit MIM_2CRV_LP for collateral', async () => {
    const { beefyMIM2CRVVault, deployer, moomim_2crv, aMooMIM_2CRV, MIM_2CRV_LP } = testEnv;
    const ethers = (DRE as any).ethers;

    // Make some test MIM_2CRV_LP for depositor
    const amountLPtoDeposit = await convertToCurrencyDecimals(MIM_2CRV_LP.address, '300');
    const lpOwnerAddress = '0x8a06afaba9c76c4042f42881f9d40482855a1a76';
    await impersonateAccountsHardhat([lpOwnerAddress]);
    let signer = await ethers.provider.getSigner(lpOwnerAddress);
    await MIM_2CRV_LP.connect(signer).transfer(deployer.address, amountLPtoDeposit);

    await MIM_2CRV_LP.connect(deployer.signer).approve(
      beefyMIM2CRVVault.address,
      amountLPtoDeposit
    );

    await beefyMIM2CRVVault
      .connect(deployer.signer)
      .depositCollateral(MIM_2CRV_LP.address, amountLPtoDeposit);

    expect(await moomim_2crv.balanceOf(beefyMIM2CRVVault.address)).to.be.equal(0);
    expect(await aMooMIM_2CRV.balanceOf(beefyMIM2CRVVault.address)).to.be.equal(0);
    expect(await aMooMIM_2CRV.balanceOf(deployer.address)).to.be.gte(
      await convertToCurrencyDecimals(MIM_2CRV_LP.address, '299.99')
    );
    expect(await MIM_2CRV_LP.balanceOf(deployer.address)).to.be.equal(0);
  });

  it('transferring aMooMIM_2CRV should be success after deposit MIM_2CRV_LP', async () => {
    const { aMooMIM_2CRV, users, deployer } = testEnv;
    await expect(
      aMooMIM_2CRV
        .connect(deployer.signer)
        .transfer(users[0].address, await convertToCurrencyDecimals(aMooMIM_2CRV.address, '10'))
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, beefyMIM2CRVVault, MIM_2CRV_LP } = testEnv;
    const amountLPtoDeposit = await convertToCurrencyDecimals(MIM_2CRV_LP.address, '300');
    await expect(
      beefyMIM2CRVVault
        .connect(deployer.signer)
        .withdrawCollateral(MIM_2CRV_LP.address, amountLPtoDeposit, 9900, deployer.address)
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, moomim_2crv, beefyMIM2CRVVault, MIM_2CRV_LP } = testEnv;
    const mooMIM2CRVBalanceOfPool = await moomim_2crv.balanceOf(beefyMIM2CRVVault.address);
    const lpBeforeBalanceOfUser = await MIM_2CRV_LP.balanceOf(deployer.address);
    const lpWithdrawAmount = await convertToCurrencyDecimals(MIM_2CRV_LP.address, '289');

    await beefyMIM2CRVVault
      .connect(deployer.signer)
      .withdrawCollateral(MIM_2CRV_LP.address, lpWithdrawAmount, 9900, deployer.address);

    const lpCurrentBalanceOfUser = await MIM_2CRV_LP.balanceOf(deployer.address);
    expect(mooMIM2CRVBalanceOfPool).to.be.equal(0);
    expect(lpCurrentBalanceOfUser.sub(lpBeforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(MIM_2CRV_LP.address, '288.97')
    );
    expect(await MIM_2CRV_LP.balanceOf(beefyMIM2CRVVault.address)).to.be.equal(0);
  });
});

 makeSuite('BeefyMIM2CRVVault - use other coin as collateral', (testEnv) => {
   it('Should revert to use any of coin other than MIM_2CRV_LP as collateral', async () => {
     const { usdc, beefyMIM2CRVVault, moomim_2crv } = testEnv;
     // TODO @bshevchenko: use Error const instead of 82
     await expect(beefyMIM2CRVVault.depositCollateral(moomim_2crv.address, 1000)).to.be.revertedWith('82');
   });
 });

 makeSuite('BeefyMIM2CRVVault', (testEnv: TestEnv) => {
   it('distribute yield to supplier for single asset', async () => {
     const { pool, beefyMIM2CRVVault, usdc, users, MIM_2CRV_LP, moomim_2crv, aMooMIM_2CRV, aUsdc } = testEnv;
     const depositor = users[0];
     const borrower = users[1];
     const ethers = (DRE as any).ethers;

     const amountLPtoDeposit = await convertToCurrencyDecimals(MIM_2CRV_LP.address, '3000');
     const usdcOwnerAddress = '0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe';
     const depositUSDC = '7000';

     // Make some test USDC for depositor
     await impersonateAccountsHardhat([usdcOwnerAddress]);
     let signer = await ethers.provider.getSigner(usdcOwnerAddress);
     const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
     await usdc.connect(signer).Swapin(
       '0x6af483697065dda1e50693750662adb39012699bbdb49d908d682a275a83c4cf', // TODO random tx hash
       depositor.address,
       amountUSDCtoDeposit
     );

     // approve protocol to access depositor wallet
     await usdc.connect(depositor.signer).approve(pool.address, amountUSDCtoDeposit);

     // Supplier deposits USDC
     await pool
       .connect(depositor.signer)
       .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

     const lpOwnerAddress = '0x8a06afaba9c76c4042f42881f9d40482855a1a76';
     await impersonateAccountsHardhat([lpOwnerAddress]);
     signer = await ethers.provider.getSigner(lpOwnerAddress);
     await MIM_2CRV_LP.connect(signer).transfer(borrower.address, amountLPtoDeposit);

     // approve protocol to access borrower wallet
     await MIM_2CRV_LP.connect(borrower.signer).approve(beefyMIM2CRVVault.address, amountLPtoDeposit);

     // deposit collateral to borrow
     await beefyMIM2CRVVault.connect(borrower.signer).depositCollateral(MIM_2CRV_LP.address, amountLPtoDeposit);
     expect(await beefyMIM2CRVVault.getYieldAmount()).to.be.equal(0);

     // To simulate yield in lendingPool, deposit some moomim_2crv to aMooMIM_2CRV contract
     const moomim2crvOwnerAddress = '0x1a69208eb1cf5576807e373fc01594cbcc3d022f';
     const yieldmoomim2crvAmount = await convertToCurrencyDecimals(MIM_2CRV_LP.address, '30');
     await impersonateAccountsHardhat([moomim2crvOwnerAddress]);
     signer = await ethers.provider.getSigner(moomim2crvOwnerAddress);
     await moomim_2crv.connect(signer).transfer(aMooMIM_2CRV.address, yieldmoomim2crvAmount);

     expect(await beefyMIM2CRVVault.getYieldAmount()).to.be.gt(await convertToCurrencyDecimals(MIM_2CRV_LP.address, '29.9999'));
     expect(await usdc.balanceOf(beefyMIM2CRVVault.address)).to.be.equal(0);
     expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);

     // process yield, so all yield should be converted to usdc
     await beefyMIM2CRVVault.processYield();
     expect(await aUsdc.balanceOf(depositor.address)).to.be.gt(amountUSDCtoDeposit);
   });
 });

 makeSuite('BeefyMIM2CRVVault', (testEnv: TestEnv) => {
   it('distribute yield to supplier for multiple asset', async () => {
     const { pool, beefyMIM2CRVVault, usdc, usdt, users, moomim_2crv, aUsdc, aUsdt, aMooMIM_2CRV, MIM_2CRV_LP, dai, aDai } = testEnv;
     const depositor = users[0];
     const depositor1 = users[1];
     const depositor2 = users[2];
     const borrower = users[3];
     const ethers = (DRE as any).ethers;
     const usdcOwnerAddress = '0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe';
     const depositUSDC = '7000';
     //Make some test USDC for depositor
     await impersonateAccountsHardhat([usdcOwnerAddress]);
     let signer = await ethers.provider.getSigner(usdcOwnerAddress);
     const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
     await usdc.connect(signer).Swapin(
       '0x6af483697065dda1e50693750662adb39012699bbdb49d908d682a275a83c4cf', // TODO random tx hash
       depositor.address,
       amountUSDCtoDeposit
     );

     //approve protocol to access depositor wallet
     await usdc.connect(depositor.signer).approve(pool.address, amountUSDCtoDeposit);

     //Supplier  deposits 7000 USDC
     await pool
       .connect(depositor.signer)
       .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

     const daiOwnerAddress = '0x4188663a85c92eea35b5ad3aa5ca7ceb237c6fe9';
     const depositDAI = '7000';
     //Make some test DAI for depositor
     await impersonateAccountsHardhat([daiOwnerAddress]);
     signer = await ethers.provider.getSigner(daiOwnerAddress);
     const amountDAItoDeposit = await convertToCurrencyDecimals(dai.address, depositDAI);
     await dai.connect(signer).transfer(depositor1.address, amountDAItoDeposit);

     //approve protocol to access depositor wallet
     await dai.connect(depositor1.signer).approve(pool.address, amountDAItoDeposit);

     //Supplier deposits 7000 DAI
     await pool
       .connect(depositor1.signer)
       .deposit(dai.address, amountDAItoDeposit, depositor1.address, '0');

     const usdtOwnerAddress = '0x9308e02e947a61bdf86fbac34d1791921e00ea65';
     const depositUSDT = '3500';
     //Make some test USDT for depositor
     await impersonateAccountsHardhat([usdtOwnerAddress]);
     signer = await ethers.provider.getSigner(usdtOwnerAddress);
     const amountUSDTtoDeposit = await convertToCurrencyDecimals(usdt.address, depositUSDT);
     await usdt.connect(signer).transfer(depositor2.address, amountUSDTtoDeposit);

     //approve protocol to access depositor wallet
     await usdt.connect(depositor2.signer).approve(pool.address, amountUSDTtoDeposit);

     //Supplier  deposits 3500 USDT
     await pool
       .connect(depositor2.signer)
       .deposit(usdt.address, amountUSDTtoDeposit, depositor2.address, '0');

     const lpOwnerAddress = '0x8a06afaba9c76c4042f42881f9d40482855a1a76';
     const depositLP = '30';
     const depositLPAmount = await convertToCurrencyDecimals(MIM_2CRV_LP.address, depositLP);
     //Make some test MIM_2CRV_LP for borrower
     await impersonateAccountsHardhat([lpOwnerAddress]);
     signer = await ethers.provider.getSigner(lpOwnerAddress);

     //transfer to borrower
     await MIM_2CRV_LP.connect(signer).transfer(borrower.address, depositLPAmount);

     //approve protocol to access borrower wallet
     await MIM_2CRV_LP.connect(borrower.signer).approve(beefyMIM2CRVVault.address, depositLPAmount);

     // deposit collateral to borrow
     await beefyMIM2CRVVault.connect(borrower.signer).depositCollateral(MIM_2CRV_LP.address, depositLPAmount);
     expect(await beefyMIM2CRVVault.getYieldAmount()).to.be.equal(0);

     //To simulate yield in lendingPool, deposit some mooMIM2CRV to aMooMIM_2CRV contract
     const moomim2crvOwnerAddress = '0x1a69208eb1cf5576807e373fc01594cbcc3d022f';
     const yieldmoomim2crv = '30';
     const yieldmooMIM2CRVAmount = await convertToCurrencyDecimals(moomim_2crv.address, yieldmoomim2crv);
     //Make some test mooMIM2CRV
     await impersonateAccountsHardhat([moomim2crvOwnerAddress]);
     signer = await ethers.provider.getSigner(moomim2crvOwnerAddress);
     await moomim_2crv.connect(signer).transfer(aMooMIM_2CRV.address, yieldmooMIM2CRVAmount);

     expect((await beefyMIM2CRVVault.getYieldAmount()).gt(parseEther('29.999'))).to.be.equal(true);
     expect(await usdc.balanceOf(beefyMIM2CRVVault.address)).to.be.equal(0);
     expect(await dai.balanceOf(beefyMIM2CRVVault.address)).to.be.equal(0);
     expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);
     expect(await aDai.balanceOf(depositor1.address)).to.be.equal(amountDAItoDeposit);
     expect(await aUsdt.balanceOf(depositor2.address)).to.be.equal(amountUSDTtoDeposit);

     // process yield, so all yield should be converted to usdc and dai
     await beefyMIM2CRVVault.processYield();
     expect(await aUsdc.balanceOf(depositor.address)).to.be.gt(amountUSDCtoDeposit);
     expect(await aDai.balanceOf(depositor1.address)).to.be.gt(amountDAItoDeposit);
     expect(await aUsdt.balanceOf(depositor2.address)).to.be.gt(amountUSDTtoDeposit);
   });
 });
