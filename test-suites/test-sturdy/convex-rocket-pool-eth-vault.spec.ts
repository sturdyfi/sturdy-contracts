/**
 * @dev test for ConvexRocketPoolETHVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { printDivider } from './helpers/utils/helpers';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';

const { parseEther } = ethers.utils;

makeSuite('ConvexRocketPoolETHVault', (testEnv: TestEnv) => {
  it('failed deposit for collateral without ether', async () => {
    const { convexRocketPoolETHVault } = testEnv;

    await expect(convexRocketPoolETHVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.reverted;
  });

  it('deposit rETH-WstETH for collateral', async () => {
    const { convexRocketPoolETHVault, deployer, cvxreth_wsteth, aCVXRETH_WSTETH, RETH_WSTETH_LP } =
      testEnv;
    const ethers = (DRE as any).ethers;

    // Make some test RETH_WSTETH_LP for depositor
    const amountRETHWstETHLPtoDeposit = await convertToCurrencyDecimals(
      RETH_WSTETH_LP.address,
      '1.1'
    );
    const rETHWstETHLPOwnerAddress = '0x427E51f03D287809ab684878AE2176BA347c8c25';
    await impersonateAccountsHardhat([rETHWstETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(rETHWstETHLPOwnerAddress);
    await RETH_WSTETH_LP.connect(signer).transfer(deployer.address, amountRETHWstETHLPtoDeposit);

    await RETH_WSTETH_LP.connect(deployer.signer).approve(
      convexRocketPoolETHVault.address,
      amountRETHWstETHLPtoDeposit
    );

    await convexRocketPoolETHVault
      .connect(deployer.signer)
      .depositCollateral(RETH_WSTETH_LP.address, amountRETHWstETHLPtoDeposit);

    expect(await cvxreth_wsteth.balanceOf(convexRocketPoolETHVault.address)).to.be.equal(0);
    expect(await aCVXRETH_WSTETH.balanceOf(convexRocketPoolETHVault.address)).to.be.equal(0);
    expect(await aCVXRETH_WSTETH.balanceOf(deployer.address)).to.be.gte(
      await convertToCurrencyDecimals(RETH_WSTETH_LP.address, '1.099')
    );
    expect(await RETH_WSTETH_LP.balanceOf(deployer.address)).to.be.equal(0);
  });

  it('transferring aCVXRETH_WSTETH should be success after deposit ETH', async () => {
    const { aCVXRETH_WSTETH, users } = testEnv;
    await expect(
      aCVXRETH_WSTETH.transfer(
        users[0].address,
        await convertToCurrencyDecimals(aCVXRETH_WSTETH.address, '0.05')
      )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, convexRocketPoolETHVault, RETH_WSTETH_LP } = testEnv;
    const amountRETHWstETHLPtoDeposit = await convertToCurrencyDecimals(
      RETH_WSTETH_LP.address,
      '1.1'
    );
    await expect(
      convexRocketPoolETHVault.withdrawCollateral(
        RETH_WSTETH_LP.address,
        amountRETHWstETHLPtoDeposit,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, cvxreth_wsteth, convexRocketPoolETHVault, RETH_WSTETH_LP } = testEnv;
    const rethwstethBalanceOfPool = await cvxreth_wsteth.balanceOf(
      convexRocketPoolETHVault.address
    );
    const rETHWstETHLPBeforeBalanceOfUser = await RETH_WSTETH_LP.balanceOf(deployer.address);
    const rETHWstETHLPWithdrawAmount = await convertToCurrencyDecimals(
      RETH_WSTETH_LP.address,
      '1.0499'
    );

    await convexRocketPoolETHVault
      .connect(deployer.signer)
      .withdrawCollateral(RETH_WSTETH_LP.address, rETHWstETHLPWithdrawAmount, deployer.address);

    const rETHWstETHLPCurrentBalanceOfUser = await RETH_WSTETH_LP.balanceOf(deployer.address);
    expect(rethwstethBalanceOfPool).to.be.equal(0);
    expect(rETHWstETHLPCurrentBalanceOfUser.sub(rETHWstETHLPBeforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(RETH_WSTETH_LP.address, '1.049')
    );
    expect(await RETH_WSTETH_LP.balanceOf(convexRocketPoolETHVault.address)).to.be.equal(0);
  });
});

makeSuite('convexRocketPoolETHVault - use other coin as collateral', (testEnv) => {
  it('Should revert to use any of coin other than TOMB_MIMATIC_LP as collateral', async () => {
    const { usdc, convexRocketPoolETHVault, cvxreth_wsteth } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(
      convexRocketPoolETHVault.depositCollateral(cvxreth_wsteth.address, 1000)
    ).to.be.revertedWith('82');
  });
});

makeSuite('convexRocketPoolETHVault', (testEnv: TestEnv) => {
  it('distribute yield to supplier for single asset', async () => {
    const {
      pool,
      convexRocketPoolETHVault,
      usdc,
      users,
      cvxreth_wsteth,
      aUsdc,
      aCVXRETH_WSTETH,
      RETH_WSTETH_LP,
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

    const rETHWstETHLPOwnerAddress = '0x427E51f03D287809ab684878AE2176BA347c8c25';
    const depositRETHWstETH = '10';
    const depositRETHWstETHAmount = await convertToCurrencyDecimals(
      RETH_WSTETH_LP.address,
      depositRETHWstETH
    );
    //Make some test stETH for borrower
    await impersonateAccountsHardhat([rETHWstETHLPOwnerAddress]);
    signer = await ethers.provider.getSigner(rETHWstETHLPOwnerAddress);

    //transfer to borrower
    await RETH_WSTETH_LP.connect(signer).transfer(borrower.address, depositRETHWstETHAmount);

    //approve protocol to access borrower wallet
    await RETH_WSTETH_LP.connect(borrower.signer).approve(
      convexRocketPoolETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexRocketPoolETHVault
      .connect(borrower.signer)
      .depositCollateral(RETH_WSTETH_LP.address, depositRETHWstETHAmount);
    expect(await convexRocketPoolETHVault.getYieldAmount()).to.be.equal(0);

    //To simulate yield in lendingPool, deposit some cvxRETHWstETH to aCVXRETH_WSTETH contract
    const cvxRETHWstETHOwnerAddress = convexRocketPoolETHVault.address;
    const yieldcvxRETHWstETH = '1000';
    const yieldcvxRETHWstETHAmount = await convertToCurrencyDecimals(
      cvxreth_wsteth.address,
      yieldcvxRETHWstETH
    );
    //Make some test cvxRETHWstETH
    await users[2].signer.sendTransaction({
      value: parseEther('10'),
      to: cvxRETHWstETHOwnerAddress,
    });
    await impersonateAccountsHardhat([cvxRETHWstETHOwnerAddress]);
    signer = await ethers.provider.getSigner(cvxRETHWstETHOwnerAddress);
    await cvxreth_wsteth.connect(signer).mint(aCVXRETH_WSTETH.address, yieldcvxRETHWstETHAmount);

    expect(
      (await convexRocketPoolETHVault.getYieldAmount()).gt(
        await convertToCurrencyDecimals(RETH_WSTETH_LP.address, '999.9')
      )
    ).to.be.equal(true);
    expect(await usdc.balanceOf(convexRocketPoolETHVault.address)).to.be.equal(0);
    expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);

    // process yield, so all yield should be converted to usdc
    await convexRocketPoolETHVault.processYield();
    const yieldUSDC = await convertToCurrencyDecimals(usdc.address, '7000');
    expect((await aUsdc.balanceOf(depositor.address)).gt(yieldUSDC)).to.be.equal(true);
  });
});

makeSuite('convexRocketPoolETHVault', (testEnv: TestEnv) => {
  it('distribute yield to supplier for multiple asset', async () => {
    const {
      pool,
      convexRocketPoolETHVault,
      usdc,
      users,
      cvxreth_wsteth,
      aUsdc,
      aCVXRETH_WSTETH,
      dai,
      aDai,
      RETH_WSTETH_LP,
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

    const rETHWstETHLPOwnerAddress = '0x427E51f03D287809ab684878AE2176BA347c8c25';
    const depositRETHWstETH = '10';
    const depositRETHWstETHAmount = await convertToCurrencyDecimals(
      RETH_WSTETH_LP.address,
      depositRETHWstETH
    );
    //Make some test stETH for borrower
    await impersonateAccountsHardhat([rETHWstETHLPOwnerAddress]);
    signer = await ethers.provider.getSigner(rETHWstETHLPOwnerAddress);

    //transfer to borrower
    await RETH_WSTETH_LP.connect(signer).transfer(borrower.address, depositRETHWstETHAmount);

    //approve protocol to access borrower wallet
    await RETH_WSTETH_LP.connect(borrower.signer).approve(
      convexRocketPoolETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexRocketPoolETHVault
      .connect(borrower.signer)
      .depositCollateral(RETH_WSTETH_LP.address, depositRETHWstETHAmount);
    expect(await convexRocketPoolETHVault.getYieldAmount()).to.be.equal(0);

    //To simulate yield in lendingPool, deposit some cvxRETHWstETH to aCVXRETH_WSTETH contract
    const cvxRETHWstETHOwnerAddress = convexRocketPoolETHVault.address;
    const yieldcvxRETHWstETH = '1000';
    const yieldcvxRETHWstETHAmount = await convertToCurrencyDecimals(
      cvxreth_wsteth.address,
      yieldcvxRETHWstETH
    );
    //Make some test cvxRETHWstETH
    await users[2].signer.sendTransaction({
      value: parseEther('10'),
      to: cvxRETHWstETHOwnerAddress,
    });
    await impersonateAccountsHardhat([cvxRETHWstETHOwnerAddress]);
    signer = await ethers.provider.getSigner(cvxRETHWstETHOwnerAddress);
    await cvxreth_wsteth.connect(signer).mint(aCVXRETH_WSTETH.address, yieldcvxRETHWstETHAmount);

    expect(
      (await convexRocketPoolETHVault.getYieldAmount()).gt(
        await convertToCurrencyDecimals(cvxreth_wsteth.address, '999.9')
      )
    ).to.be.equal(true);
    expect(await usdc.balanceOf(convexRocketPoolETHVault.address)).to.be.equal(0);
    expect(await dai.balanceOf(convexRocketPoolETHVault.address)).to.be.equal(0);
    expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);
    expect(await aDai.balanceOf(other_depositor.address)).to.be.equal(amountDAItoDeposit);

    // process yield, so all yield should be converted to usdc and dai
    await convexRocketPoolETHVault.processYield();
    const yieldUSDC = await convertToCurrencyDecimals(usdc.address, '7000');
    const yieldDAI = await convertToCurrencyDecimals(dai.address, '3500');
    expect((await aUsdc.balanceOf(depositor.address)).gt(yieldUSDC)).to.be.equal(true);
    expect((await aDai.balanceOf(other_depositor.address)).gt(yieldDAI)).to.be.equal(true);
  });
});
