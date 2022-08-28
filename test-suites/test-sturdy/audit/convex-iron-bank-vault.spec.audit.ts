/**
 * @dev test for ConvexIronBankVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv, SignerWithAddress } from '../helpers/make-suite';
import { BigNumberish } from 'ethers';
import {
  DRE,
  impersonateAccountsHardhat,
  advanceBlock,
  timeLatest,
} from '../../../helpers/misc-utils';
import { convertToCurrencyDecimals } from '../../../helpers/contracts-helpers';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../../helpers/constants';

// Constant to simulate convex yield, it indicates that time period.
const CONVEX_YIELD_PERIOD = 100000;

// Constants related to asset amount during test
const DEPOSIT_AMOUNT = '0.03';
const TRANSFER_ATOKEN_AMOUNT = '0.01';
const WITHDRAW_AMOUNT = '0.02'; // = deposit - transfer

const prepareCollateralForUser = async (
  testEnv: TestEnv,
  user: SignerWithAddress,
  amount: BigNumberish
) => {
  const { IRON_BANK_LP } = testEnv;
  const ethers = (DRE as any).ethers;

  const LPOwnerAddress = '0x2d2421ff1b3b35e1ca8a20eb89fb79803b304c01';
  await impersonateAccountsHardhat([LPOwnerAddress]);
  const signer = await ethers.provider.getSigner(LPOwnerAddress);

  //transfer to borrower
  await IRON_BANK_LP.connect(signer).transfer(user.address, amount);
};

makeSuite('ConvexIronBankVault - Deposit & Withdraw', (testEnv: TestEnv) => {
  it('should be reverted if try to use an invalid token as collateral', async () => {
    const { convexIronBankVault } = testEnv;
    await expect(convexIronBankVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith('82');
  });
  it('should be reverted if try to use any of coin other than hCRV as collateral', async () => {
    const { usdc, convexIronBankVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(convexIronBankVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith(
      '82'
    );
  });
  it('deposit IRON_BANK_LP for collateral', async () => {
    const { convexIronBankVault, deployer, cvxiron_bank, aCVXIRON_BANK, IRON_BANK_LP } = testEnv;

    // Prepare some IRON_BANK_LP for depositor
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      IRON_BANK_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

    // allow token transfer to this vault
    await IRON_BANK_LP.connect(deployer.signer).approve(
      convexIronBankVault.address,
      assetAmountToDeposit
    );

    // deposit collateral
    await convexIronBankVault
      .connect(deployer.signer)
      .depositCollateral(IRON_BANK_LP.address, assetAmountToDeposit);

    expect(await IRON_BANK_LP.balanceOf(deployer.address)).to.be.equal(0);
    expect(await cvxiron_bank.balanceOf(convexIronBankVault.address)).to.be.equal(0);
    expect(await aCVXIRON_BANK.balanceOf(convexIronBankVault.address)).to.be.equal(0);
    expect(await aCVXIRON_BANK.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
  });

  it('transferring aCVXIRON_BANK should be success after deposit IRON_BANK_LP', async () => {
    const { aCVXIRON_BANK, deployer, users } = testEnv;
    await expect(
      aCVXIRON_BANK
        .connect(deployer.signer)
        .transfer(
          users[0].address,
          await convertToCurrencyDecimals(aCVXIRON_BANK.address, TRANSFER_ATOKEN_AMOUNT)
        )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, convexIronBankVault, IRON_BANK_LP } = testEnv;

    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      IRON_BANK_LP.address,
      DEPOSIT_AMOUNT
    );
    await expect(
      convexIronBankVault.withdrawCollateral(
        IRON_BANK_LP.address,
        amountAssetToWithdraw,
        9900,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, aCVXIRON_BANK, convexIronBankVault, IRON_BANK_LP } = testEnv;
    const ironbankBalanceOfPool = await aCVXIRON_BANK.balanceOf(convexIronBankVault.address);
    const beforeBalanceOfUser = await IRON_BANK_LP.balanceOf(deployer.address);
    // withdraw
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      IRON_BANK_LP.address,
      WITHDRAW_AMOUNT
    );
    await convexIronBankVault
      .connect(deployer.signer)
      .withdrawCollateral(IRON_BANK_LP.address, amountAssetToWithdraw, 9900, deployer.address);

    const afterBalanceOfUser = await IRON_BANK_LP.balanceOf(deployer.address);

    expect(ironbankBalanceOfPool).to.be.equal(0);
    expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(IRON_BANK_LP.address, WITHDRAW_AMOUNT)
    );
    expect(await IRON_BANK_LP.balanceOf(convexIronBankVault.address)).to.be.equal(0);
  });
});
