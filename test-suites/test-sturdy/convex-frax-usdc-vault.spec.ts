/**
 * @dev test for ConvexFRAXUSDCVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { BigNumberish } from 'ethers';
import {
  DRE,
  impersonateAccountsHardhat,
  advanceBlock,
  timeLatest,
} from '../../helpers/misc-utils';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';

// Constant to simulate convex yield, it indicates that time period.
const CONVEX_YIELD_PERIOD = 100000;

// Constants related to asset amount during test
const DEPOSIT_AMOUNT = '3000';
const TRANSFER_ATOKEN_AMOUNT = '1000';
const WITHDRAW_AMOUNT = '2000'; // = deposit - transfer

const prepareCollateralForUser = async (
  testEnv: TestEnv,
  user: SignerWithAddress,
  amount: BigNumberish
) => {
  const { FRAX_USDC_LP } = testEnv;
  const ethers = (DRE as any).ethers;

  const LPOwnerAddress = '0xF28E1B06E00e8774C612e31aB3Ac35d5a720085f';
  await impersonateAccountsHardhat([LPOwnerAddress]);
  const signer = await ethers.provider.getSigner(LPOwnerAddress);

  //transfer to borrower
  await FRAX_USDC_LP.connect(signer).transfer(user.address, amount);
};

makeSuite('ConvexFRAXUSDCVault - Deposit & Withdraw', (testEnv: TestEnv) => {
  it('should be reverted if try to use an invalid token as collateral', async () => {
    const { convexFRAXUSDCVault } = testEnv;
    await expect(convexFRAXUSDCVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith('82');
  });
  it('should be reverted if try to use any of coin other than FRAX-USDC as collateral', async () => {
    const { usdc, convexFRAXUSDCVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(convexFRAXUSDCVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith(
      '82'
    );
  });
  it('deposit FRAX-USDC for collateral', async () => {
    const { convexFRAXUSDCVault, deployer, cvxfrax_usdc, aCVXFRAX_USDC, FRAX_USDC_LP } = testEnv;

    // Prepare some FRAX_USDC_LP for depositor
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      FRAX_USDC_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

    // allow token transfer to this vault
    await FRAX_USDC_LP.connect(deployer.signer).approve(
      convexFRAXUSDCVault.address,
      assetAmountToDeposit
    );

    // deposit collateral
    await convexFRAXUSDCVault
      .connect(deployer.signer)
      .depositCollateral(FRAX_USDC_LP.address, assetAmountToDeposit);

    expect(await FRAX_USDC_LP.balanceOf(deployer.address)).to.be.equal(0);
    expect(await cvxfrax_usdc.balanceOf(convexFRAXUSDCVault.address)).to.be.equal(0);
    expect(await aCVXFRAX_USDC.balanceOf(convexFRAXUSDCVault.address)).to.be.equal(0);
    expect(await aCVXFRAX_USDC.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
  });

  it('transferring aCVXFRAX_USDC should be success after deposit FRAX_USDC_LP', async () => {
    const { aCVXFRAX_USDC, deployer, users } = testEnv;
    await expect(
      aCVXFRAX_USDC
        .connect(deployer.signer)
        .transfer(
          users[0].address,
          await convertToCurrencyDecimals(aCVXFRAX_USDC.address, TRANSFER_ATOKEN_AMOUNT)
        )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, convexFRAXUSDCVault, FRAX_USDC_LP } = testEnv;

    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      FRAX_USDC_LP.address,
      DEPOSIT_AMOUNT
    );
    await expect(
      convexFRAXUSDCVault.withdrawCollateral(
        FRAX_USDC_LP.address,
        amountAssetToWithdraw,
        9900,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, cvxfrax_usdc, convexFRAXUSDCVault, FRAX_USDC_LP } = testEnv;
    const dola3crvBalanceOfPool = await cvxfrax_usdc.balanceOf(convexFRAXUSDCVault.address);
    const beforeBalanceOfUser = await FRAX_USDC_LP.balanceOf(deployer.address);
    // withdraw
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      FRAX_USDC_LP.address,
      WITHDRAW_AMOUNT
    );
    await convexFRAXUSDCVault
      .connect(deployer.signer)
      .withdrawCollateral(FRAX_USDC_LP.address, amountAssetToWithdraw, 9900, deployer.address);

    const afterBalanceOfUser = await FRAX_USDC_LP.balanceOf(deployer.address);

    expect(dola3crvBalanceOfPool).to.be.equal(0);
    expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(FRAX_USDC_LP.address, WITHDRAW_AMOUNT)
    );
    expect(await FRAX_USDC_LP.balanceOf(convexFRAXUSDCVault.address)).to.be.equal(0);
  });
});

makeSuite('ConvexFRAXUSDCVault - Process Yield', (testEnv: TestEnv) => {
  it('send yield to YieldManager', async () => {
    const { convexFRAXUSDCVault, users, FRAX_USDC_LP, CRV, CVX, yieldManager } = testEnv;
    const borrower = users[1];

    // borrower provides FRAXUSDC
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      FRAX_USDC_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, borrower, assetAmountToDeposit);
    await FRAX_USDC_LP.connect(borrower.signer).approve(
      convexFRAXUSDCVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );
    await convexFRAXUSDCVault
      .connect(borrower.signer)
      .depositCollateral(FRAX_USDC_LP.address, assetAmountToDeposit);
    expect(await convexFRAXUSDCVault.getYieldAmount()).to.be.equal(0);
    const beforeBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const beforeBalanceOfCVX = await CVX.balanceOf(yieldManager.address);

    // Simulate yield
    await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());

    // process yield, so all yield should be sent to YieldManager
    await convexFRAXUSDCVault.processYield();

    const afterBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const afterBalanceOfCVX = await CVX.balanceOf(yieldManager.address);
    expect(afterBalanceOfCRV).to.be.gt(beforeBalanceOfCRV);
    expect(afterBalanceOfCVX).to.be.gt(beforeBalanceOfCVX);
  });
});
