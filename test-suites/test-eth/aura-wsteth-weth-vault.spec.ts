/**
 * @dev test for AuraWSTETHWETHVault functions
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
const AURA_YIELD_PERIOD = 100000;

// Constants related to asset amount during test
const DEPOSIT_AMOUNT = '2';
const TRANSFER_ATOKEN_AMOUNT = '0.5';
const WITHDRAW_AMOUNT = '1.5'; // = deposit - transfer

const prepareCollateralForUser = async (
  testEnv: TestEnv,
  user: SignerWithAddress,
  amount: BigNumberish
) => {
  const { BAL_WSTETH_WETH_LP } = testEnv;
  const ethers = (DRE as any).ethers;

  const LPOwnerAddress = '0x8627425d8b3c16d16683a1e1e17ff00a2596e05f';
  await impersonateAccountsHardhat([LPOwnerAddress]);
  const signer = await ethers.provider.getSigner(LPOwnerAddress);

  //transfer to borrower
  await BAL_WSTETH_WETH_LP.connect(signer).transfer(user.address, amount);
};

makeSuite('AuraWSTETHWETHVault - Deposit & Withdraw', (testEnv: TestEnv) => {
  it('should be reverted if try to use an invalid token as collateral', async () => {
    const { auraWSTETHWETHVault } = testEnv;
    await expect(auraWSTETHWETHVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith('82');
  });
  it('should be reverted if try to use any of coin other than WSTETH-WETH as collateral', async () => {
    const { weth, auraWSTETHWETHVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(auraWSTETHWETHVault.depositCollateral(weth.address, 1000)).to.be.revertedWith(
      '82'
    );
  });
  it('deposit WSTETH-WETH for collateral', async () => {
    const { auraWSTETHWETHVault, deployer, aurawsteth_weth, aAURAWSTETH_WETH, BAL_WSTETH_WETH_LP } = testEnv;

    // Prepare some BAL_WSTETH_WETH_LP for depositor
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      BAL_WSTETH_WETH_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

    // allow token transfer to this vault
    await BAL_WSTETH_WETH_LP.connect(deployer.signer).approve(
      auraWSTETHWETHVault.address,
      assetAmountToDeposit
    );

    // deposit collateral
    await auraWSTETHWETHVault
      .connect(deployer.signer)
      .depositCollateral(BAL_WSTETH_WETH_LP.address, assetAmountToDeposit);

    expect(await BAL_WSTETH_WETH_LP.balanceOf(deployer.address)).to.be.equal(0);
    expect(await aurawsteth_weth.balanceOf(auraWSTETHWETHVault.address)).to.be.equal(0);
    expect(await aAURAWSTETH_WETH.balanceOf(auraWSTETHWETHVault.address)).to.be.equal(0);
    expect(await aAURAWSTETH_WETH.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
  });

  it('transferring aAURAWSTETH_WETH should be success after deposit BAL_WSTETH_WETH_LP', async () => {
    const { aAURAWSTETH_WETH, deployer, users } = testEnv;
    await expect(
      aAURAWSTETH_WETH
        .connect(deployer.signer)
        .transfer(
          users[0].address,
          await convertToCurrencyDecimals(aAURAWSTETH_WETH.address, TRANSFER_ATOKEN_AMOUNT)
        )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, auraWSTETHWETHVault, BAL_WSTETH_WETH_LP } = testEnv;

    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      BAL_WSTETH_WETH_LP.address,
      DEPOSIT_AMOUNT
    );
    await expect(
      auraWSTETHWETHVault.withdrawCollateral(
        BAL_WSTETH_WETH_LP.address,
        amountAssetToWithdraw,
        9900,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, aurawsteth_weth, auraWSTETHWETHVault, BAL_WSTETH_WETH_LP } = testEnv;
    const dola3crvBalanceOfPool = await aurawsteth_weth.balanceOf(auraWSTETHWETHVault.address);
    const beforeBalanceOfUser = await BAL_WSTETH_WETH_LP.balanceOf(deployer.address);
    // withdraw
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      BAL_WSTETH_WETH_LP.address,
      WITHDRAW_AMOUNT
    );
    await auraWSTETHWETHVault
      .connect(deployer.signer)
      .withdrawCollateral(BAL_WSTETH_WETH_LP.address, amountAssetToWithdraw, 9900, deployer.address);

    const afterBalanceOfUser = await BAL_WSTETH_WETH_LP.balanceOf(deployer.address);

    expect(dola3crvBalanceOfPool).to.be.equal(0);
    expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(BAL_WSTETH_WETH_LP.address, WITHDRAW_AMOUNT)
    );
    expect(await BAL_WSTETH_WETH_LP.balanceOf(auraWSTETHWETHVault.address)).to.be.equal(0);
  });
});

makeSuite('AuraWSTETHWETHVault - Process Yield', (testEnv: TestEnv) => {
  it('send yield to YieldManager', async () => {
    const { auraWSTETHWETHVault, users, BAL_WSTETH_WETH_LP, BAL, AURA, yieldManager } = testEnv;
    const borrower = users[1];

    // borrower provides ETHSTETH
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      BAL_WSTETH_WETH_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, borrower, assetAmountToDeposit);
    await BAL_WSTETH_WETH_LP.connect(borrower.signer).approve(
      auraWSTETHWETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );
    await auraWSTETHWETHVault
      .connect(borrower.signer)
      .depositCollateral(BAL_WSTETH_WETH_LP.address, assetAmountToDeposit);
    expect(await auraWSTETHWETHVault.getYieldAmount()).to.be.equal(0);
    const beforeBalanceOfBAL = await BAL.balanceOf(yieldManager.address);
    const beforeBalanceOfAURA = await AURA.balanceOf(yieldManager.address);

    // Simulate yield
    await advanceBlock((await timeLatest()).plus(AURA_YIELD_PERIOD).toNumber());

    // process yield, so all yield should be sent to YieldManager
    await auraWSTETHWETHVault.processYield();

    const afterBalanceOfBAL = await BAL.balanceOf(yieldManager.address);
    const afterBalanceOfAURA = await AURA.balanceOf(yieldManager.address);
    expect(afterBalanceOfBAL).to.be.gt(beforeBalanceOfBAL);
    expect(afterBalanceOfAURA).to.be.gt(beforeBalanceOfAURA);
  });
});
