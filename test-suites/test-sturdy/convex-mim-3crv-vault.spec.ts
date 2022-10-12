/**
 * @dev test for ConvexMIM3CRVVault functions
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
  const { MIM_3CRV_LP } = testEnv;
  const ethers = (DRE as any).ethers;

  const LPOwnerAddress = '0xe896e539e557BC751860a7763C8dD589aF1698Ce';
  await impersonateAccountsHardhat([LPOwnerAddress]);
  const signer = await ethers.provider.getSigner(LPOwnerAddress);

  //transfer to borrower
  await MIM_3CRV_LP.connect(signer).transfer(user.address, amount);
};

makeSuite('ConvexMIM3CRVVault - Deposit & Withdraw', (testEnv: TestEnv) => {
  it('should be reverted if try to use an invalid token as collateral', async () => {
    const { convexMIM3CRVVault } = testEnv;
    await expect(convexMIM3CRVVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith('82');
  });
  it('should be reverted if try to use any of coin other than MIM3CRV-f as collateral', async () => {
    const { usdc, convexMIM3CRVVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(convexMIM3CRVVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith('82');
  });
  it('deposit MIM-3CRV for collateral', async () => {
    const { convexMIM3CRVVault, deployer, cvxmim_3crv, aCVXMIM_3CRV, MIM_3CRV_LP } = testEnv;

    // Prepare some MIM_3CRV_LP for depositor
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      MIM_3CRV_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

    // allow token transfer to this vault
    await MIM_3CRV_LP.connect(deployer.signer).approve(
      convexMIM3CRVVault.address,
      assetAmountToDeposit
    );

    // deposit collateral
    await convexMIM3CRVVault
      .connect(deployer.signer)
      .depositCollateral(MIM_3CRV_LP.address, assetAmountToDeposit);

    expect(await MIM_3CRV_LP.balanceOf(deployer.address)).to.be.equal(0);
    expect(await cvxmim_3crv.balanceOf(convexMIM3CRVVault.address)).to.be.equal(0);
    expect(await aCVXMIM_3CRV.balanceOf(convexMIM3CRVVault.address)).to.be.equal(0);
    expect(await aCVXMIM_3CRV.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
  });

  it('transferring aCVXMIM_3CRV should be success after deposit MIM_3CRV_LP', async () => {
    const { aCVXMIM_3CRV, deployer, users } = testEnv;
    await expect(
      aCVXMIM_3CRV
        .connect(deployer.signer)
        .transfer(
          users[0].address,
          await convertToCurrencyDecimals(aCVXMIM_3CRV.address, TRANSFER_ATOKEN_AMOUNT)
        )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, convexMIM3CRVVault, MIM_3CRV_LP } = testEnv;

    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      MIM_3CRV_LP.address,
      DEPOSIT_AMOUNT
    );
    await expect(
      convexMIM3CRVVault.withdrawCollateral(
        MIM_3CRV_LP.address,
        amountAssetToWithdraw,
        9900,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, aCVXMIM_3CRV, convexMIM3CRVVault, MIM_3CRV_LP } = testEnv;
    const dola3crvBalanceOfPool = await aCVXMIM_3CRV.balanceOf(convexMIM3CRVVault.address);
    const beforeBalanceOfUser = await MIM_3CRV_LP.balanceOf(deployer.address);
    // withdraw
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      MIM_3CRV_LP.address,
      WITHDRAW_AMOUNT
    );
    await convexMIM3CRVVault
      .connect(deployer.signer)
      .withdrawCollateral(MIM_3CRV_LP.address, amountAssetToWithdraw, 9900, deployer.address);

    const afterBalanceOfUser = await MIM_3CRV_LP.balanceOf(deployer.address);

    expect(dola3crvBalanceOfPool).to.be.equal(0);
    expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(MIM_3CRV_LP.address, WITHDRAW_AMOUNT)
    );
    expect(await MIM_3CRV_LP.balanceOf(convexMIM3CRVVault.address)).to.be.equal(0);
  });
});

makeSuite('convexMIM3CRVVault - Process Yield', (testEnv: TestEnv) => {
  it('send yield to YieldManager', async () => {
    const { convexMIM3CRVVault, users, MIM_3CRV_LP, CRV, CVX, yieldManager } = testEnv;
    const borrower = users[1];

    // borrower provides DOLA3CRV
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      MIM_3CRV_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, borrower, assetAmountToDeposit);
    await MIM_3CRV_LP.connect(borrower.signer).approve(
      convexMIM3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );
    await convexMIM3CRVVault
      .connect(borrower.signer)
      .depositCollateral(MIM_3CRV_LP.address, assetAmountToDeposit);
    expect(await convexMIM3CRVVault.getYieldAmount()).to.be.equal(0);
    const beforeBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const beforeBalanceOfCVX = await CVX.balanceOf(yieldManager.address);

    // Simulate yield
    await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());

    // process yield, so all yield should be sent to YieldManager
    await convexMIM3CRVVault.processYield();

    const afterBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const afterBalanceOfCVX = await CVX.balanceOf(yieldManager.address);
    expect(afterBalanceOfCRV).to.be.gt(beforeBalanceOfCRV);
    expect(afterBalanceOfCVX).to.be.gt(beforeBalanceOfCVX);
  });
});
