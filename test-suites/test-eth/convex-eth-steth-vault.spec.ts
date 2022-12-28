/**
 * @dev test for ConvexETHSTETHVault functions
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
const DEPOSIT_AMOUNT = '2';
const TRANSFER_ATOKEN_AMOUNT = '0.5';
const WITHDRAW_AMOUNT = '1.5'; // = deposit - transfer

const prepareCollateralForUser = async (
  testEnv: TestEnv,
  user: SignerWithAddress,
  amount: BigNumberish
) => {
  const { ETH_STETH_LP } = testEnv;
  const ethers = (DRE as any).ethers;

  const LPOwnerAddress = '0x43378368D84D4bA00D1C8E97EC2E6016A82fC062';
  await impersonateAccountsHardhat([LPOwnerAddress]);
  const signer = await ethers.provider.getSigner(LPOwnerAddress);

  //transfer to borrower
  await ETH_STETH_LP.connect(signer).transfer(user.address, amount);
};

makeSuite('ConvexETHSTETHVault - Deposit & Withdraw', (testEnv: TestEnv) => {
  it('should be reverted if try to use an invalid token as collateral', async () => {
    const { convexETHSTETHVault } = testEnv;
    await expect(convexETHSTETHVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith('82');
  });
  it('should be reverted if try to use any of coin other than ETH-STETH as collateral', async () => {
    const { weth, convexETHSTETHVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(convexETHSTETHVault.depositCollateral(weth.address, 1000)).to.be.revertedWith(
      '82'
    );
  });
  it('deposit ETH-STETH for collateral', async () => {
    const { convexETHSTETHVault, deployer, cvxeth_steth, aCVXETH_STETH, ETH_STETH_LP } = testEnv;

    // Prepare some ETH_STETH_LP for depositor
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

    // allow token transfer to this vault
    await ETH_STETH_LP.connect(deployer.signer).approve(
      convexETHSTETHVault.address,
      assetAmountToDeposit
    );

    // deposit collateral
    await convexETHSTETHVault
      .connect(deployer.signer)
      .depositCollateral(ETH_STETH_LP.address, assetAmountToDeposit);

    expect(await ETH_STETH_LP.balanceOf(deployer.address)).to.be.equal(0);
    expect(await cvxeth_steth.balanceOf(convexETHSTETHVault.address)).to.be.equal(0);
    expect(await aCVXETH_STETH.balanceOf(convexETHSTETHVault.address)).to.be.equal(0);
    expect(await aCVXETH_STETH.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
  });

  it('transferring aCVXETH_STETH should be success after deposit ETH_STETH_LP', async () => {
    const { aCVXETH_STETH, deployer, users } = testEnv;
    await expect(
      aCVXETH_STETH
        .connect(deployer.signer)
        .transfer(
          users[0].address,
          await convertToCurrencyDecimals(aCVXETH_STETH.address, TRANSFER_ATOKEN_AMOUNT)
        )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, convexETHSTETHVault, ETH_STETH_LP } = testEnv;

    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      DEPOSIT_AMOUNT
    );
    await expect(
      convexETHSTETHVault.withdrawCollateral(
        ETH_STETH_LP.address,
        amountAssetToWithdraw,
        9900,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, cvxeth_steth, convexETHSTETHVault, ETH_STETH_LP } = testEnv;
    const dola3crvBalanceOfPool = await cvxeth_steth.balanceOf(convexETHSTETHVault.address);
    const beforeBalanceOfUser = await ETH_STETH_LP.balanceOf(deployer.address);
    // withdraw
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      WITHDRAW_AMOUNT
    );
    await convexETHSTETHVault
      .connect(deployer.signer)
      .withdrawCollateral(ETH_STETH_LP.address, amountAssetToWithdraw, 9900, deployer.address);

    const afterBalanceOfUser = await ETH_STETH_LP.balanceOf(deployer.address);

    expect(dola3crvBalanceOfPool).to.be.equal(0);
    expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(ETH_STETH_LP.address, WITHDRAW_AMOUNT)
    );
    expect(await ETH_STETH_LP.balanceOf(convexETHSTETHVault.address)).to.be.equal(0);
  });
});

makeSuite('ConvexETHSTETHVault - Process Yield', (testEnv: TestEnv) => {
  it('send yield to YieldManager', async () => {
    const { convexETHSTETHVault, users, ETH_STETH_LP, CRV, CVX, yieldManager } = testEnv;
    const borrower = users[1];

    // borrower provides ETHSTETH
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, borrower, assetAmountToDeposit);
    await ETH_STETH_LP.connect(borrower.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );
    await convexETHSTETHVault
      .connect(borrower.signer)
      .depositCollateral(ETH_STETH_LP.address, assetAmountToDeposit);
    const beforeBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const beforeBalanceOfCVX = await CVX.balanceOf(yieldManager.address);

    // Simulate yield
    await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());

    // process yield, so all yield should be sent to YieldManager
    await convexETHSTETHVault.processYield();

    const afterBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const afterBalanceOfCVX = await CVX.balanceOf(yieldManager.address);
    expect(afterBalanceOfCRV).to.be.gt(beforeBalanceOfCRV);
    expect(afterBalanceOfCVX).to.be.gt(beforeBalanceOfCVX);
  });
});
