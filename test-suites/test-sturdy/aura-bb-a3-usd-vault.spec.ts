/**
 * @dev test for AuraBBA3USDVault functions
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

// Constant to simulate aura yield, it indicates that time period.
const AURA_YIELD_PERIOD = 100000;

// Constants related to asset amount during test
const DEPOSIT_AMOUNT = '3000';
const TRANSFER_ATOKEN_AMOUNT = '1000';
const WITHDRAW_AMOUNT = '2000'; // = deposit - transfer

const prepareCollateralForUser = async (
  testEnv: TestEnv,
  user: SignerWithAddress,
  amount: BigNumberish
) => {
  const { BAL_BB_A3_USD_LP } = testEnv;
  const ethers = (DRE as any).ethers;

  const LPOwnerAddress = '0x87839e0378c62d8962c76726cfdd932a97ef626a';
  await impersonateAccountsHardhat([LPOwnerAddress]);
  const signer = await ethers.provider.getSigner(LPOwnerAddress);

  //transfer to borrower
  await BAL_BB_A3_USD_LP.connect(signer).transfer(user.address, amount);
};

makeSuite('AuraBBA3USDVault - Deposit & Withdraw', (testEnv: TestEnv) => {
  it('should be reverted if try to use an invalid token as collateral', async () => {
    const { auraBBA3USDVault } = testEnv;
    await expect(auraBBA3USDVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith('82');
  });
  it('should be reverted if try to use any of coin other than bb-a-USD as collateral', async () => {
    const { usdc, auraBBA3USDVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(auraBBA3USDVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith('82');
  });
  it('deposit BAL-BB-A-USD for collateral', async () => {
    const { auraBBA3USDVault, deployer, aurabb_a3_usd, aAURABB_A3_USD, BAL_BB_A3_USD_LP } = testEnv;

    // Prepare some BAL_BB_A_USD_LP for depositor
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      BAL_BB_A3_USD_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

    // allow token transfer to this vault
    await BAL_BB_A3_USD_LP.connect(deployer.signer).approve(
      auraBBA3USDVault.address,
      assetAmountToDeposit
    );

    // deposit collateral
    await auraBBA3USDVault
      .connect(deployer.signer)
      .depositCollateral(BAL_BB_A3_USD_LP.address, assetAmountToDeposit);

    expect(await BAL_BB_A3_USD_LP.balanceOf(deployer.address)).to.be.equal(0);
    expect(await aurabb_a3_usd.balanceOf(auraBBA3USDVault.address)).to.be.equal(0);
    expect(await aAURABB_A3_USD.balanceOf(auraBBA3USDVault.address)).to.be.equal(0);
    expect(await aAURABB_A3_USD.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
  });

  it('transferring aAURABB_A3_USD should be success after deposit BAL_BB_A3_USD_LP', async () => {
    const { aAURABB_A3_USD, deployer, users } = testEnv;
    await expect(
      aAURABB_A3_USD
        .connect(deployer.signer)
        .transfer(
          users[0].address,
          await convertToCurrencyDecimals(aAURABB_A3_USD.address, TRANSFER_ATOKEN_AMOUNT)
        )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, auraBBA3USDVault, BAL_BB_A3_USD_LP } = testEnv;

    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      BAL_BB_A3_USD_LP.address,
      DEPOSIT_AMOUNT
    );
    await expect(
      auraBBA3USDVault.withdrawCollateral(
        BAL_BB_A3_USD_LP.address,
        amountAssetToWithdraw,
        9900,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, aAURABB_A3_USD, auraBBA3USDVault, BAL_BB_A3_USD_LP } = testEnv;
    const auraBBA3USDBalanceOfPool = await aAURABB_A3_USD.balanceOf(auraBBA3USDVault.address);
    const beforeBalanceOfUser = await BAL_BB_A3_USD_LP.balanceOf(deployer.address);
    // withdraw
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      BAL_BB_A3_USD_LP.address,
      WITHDRAW_AMOUNT
    );
    await auraBBA3USDVault
      .connect(deployer.signer)
      .withdrawCollateral(BAL_BB_A3_USD_LP.address, amountAssetToWithdraw, 9900, deployer.address);

    const afterBalanceOfUser = await BAL_BB_A3_USD_LP.balanceOf(deployer.address);

    expect(auraBBA3USDBalanceOfPool).to.be.equal(0);
    expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(BAL_BB_A3_USD_LP.address, WITHDRAW_AMOUNT)
    );
    expect(await BAL_BB_A3_USD_LP.balanceOf(auraBBA3USDVault.address)).to.be.equal(0);
  });
});

makeSuite('auraBBA3USDVault - Process Yield', (testEnv: TestEnv) => {
  it('send yield to YieldManager', async () => {
    const { auraBBA3USDVault, users, BAL_BB_A3_USD_LP, BAL, AURA, yieldManager } = testEnv;
    const borrower = users[1];

    // borrower provides BB-A3-USD
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      BAL_BB_A3_USD_LP.address,
      DEPOSIT_AMOUNT
    );

    await prepareCollateralForUser(testEnv, borrower, assetAmountToDeposit);
    await BAL_BB_A3_USD_LP.connect(borrower.signer).approve(
      auraBBA3USDVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );
    await auraBBA3USDVault
      .connect(borrower.signer)
      .depositCollateral(BAL_BB_A3_USD_LP.address, assetAmountToDeposit);
    expect(await auraBBA3USDVault.getYieldAmount()).to.be.equal(0);
    const beforeBalanceOfBAL = await BAL.balanceOf(yieldManager.address);
    const beforeBalanceOfAURA = await AURA.balanceOf(yieldManager.address);

    // Simulate yield
    await advanceBlock((await timeLatest()).plus(AURA_YIELD_PERIOD).toNumber());

    // process yield, so all yield should be sent to YieldManager
    await auraBBA3USDVault.processYield();

    const afterBalanceOfBAL = await BAL.balanceOf(yieldManager.address);
    const afterBalanceOfAURA = await AURA.balanceOf(yieldManager.address);
    expect(afterBalanceOfBAL).to.be.gt(beforeBalanceOfBAL);
    expect(afterBalanceOfAURA).to.be.gt(beforeBalanceOfAURA);
  });
});
