/**onlyAdmin
 * @dev test for AuraRETHWETHVault functions
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
const DEPOSIT_AMOUNT = '2';
const TRANSFER_ATOKEN_AMOUNT = '0.5';
const WITHDRAW_AMOUNT = '1.5'; // = deposit - transfer

const prepareCollateralForUser = async (
  testEnv: TestEnv,
  user: SignerWithAddress,
  amount: BigNumberish
) => {
  const { BAL_RETH_WETH_LP } = testEnv;
  const ethers = (DRE as any).ethers;

  const LPOwnerAddress = '0x5f98718e4e0EFcb7B5551E2B2584E6781ceAd867';
  await impersonateAccountsHardhat([LPOwnerAddress]);
  const signer = await ethers.provider.getSigner(LPOwnerAddress);

  //transfer to borrower
  await BAL_RETH_WETH_LP.connect(signer).transfer(user.address, amount);
};

makeSuite('AuraRETHWETHVault - Deposit & Withdraw', (testEnv: TestEnv) => {
  it('should be reverted if try to use an invalid token as collateral', async () => {
    const { auraRETHWETHVault } = testEnv;
    await expect(auraRETHWETHVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith('82');
  });
  it('should be reverted if try to use any of coin other than RETH-WETH as collateral', async () => {
    const { weth, auraRETHWETHVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(auraRETHWETHVault.depositCollateral(weth.address, 1000)).to.be.revertedWith(
      '82'
    );
  });
  it('deposit RETH-WETH for collateral', async () => {
    const { auraRETHWETHVault, deployer, aurareth_weth, aAURARETH_WETH, BAL_RETH_WETH_LP } = testEnv;

    // Prepare some BAL_RETH_WETH_LP for depositor
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      BAL_RETH_WETH_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

    // allow token transfer to this vault
    await BAL_RETH_WETH_LP.connect(deployer.signer).approve(
      auraRETHWETHVault.address,
      assetAmountToDeposit
    );

    // deposit collateral
    await auraRETHWETHVault
      .connect(deployer.signer)
      .depositCollateral(BAL_RETH_WETH_LP.address, assetAmountToDeposit);

    expect(await BAL_RETH_WETH_LP.balanceOf(deployer.address)).to.be.equal(0);
    expect(await aurareth_weth.balanceOf(auraRETHWETHVault.address)).to.be.equal(0);
    expect(await aAURARETH_WETH.balanceOf(auraRETHWETHVault.address)).to.be.equal(0);
    expect(await aAURARETH_WETH.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
  });

  it('transferring aAURARETH_WETH should be success after deposit BAL_RETH_WETH_LP', async () => {
    const { aAURARETH_WETH, deployer, users } = testEnv;
    await expect(
      aAURARETH_WETH
        .connect(deployer.signer)
        .transfer(
          users[0].address,
          await convertToCurrencyDecimals(aAURARETH_WETH.address, TRANSFER_ATOKEN_AMOUNT)
        )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, auraRETHWETHVault, BAL_RETH_WETH_LP } = testEnv;

    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      BAL_RETH_WETH_LP.address,
      DEPOSIT_AMOUNT
    );
    await expect(
      auraRETHWETHVault.withdrawCollateral(
        BAL_RETH_WETH_LP.address,
        amountAssetToWithdraw,
        9900,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, aurareth_weth, auraRETHWETHVault, BAL_RETH_WETH_LP } = testEnv;
    const dola3crvBalanceOfPool = await aurareth_weth.balanceOf(auraRETHWETHVault.address);
    const beforeBalanceOfUser = await BAL_RETH_WETH_LP.balanceOf(deployer.address);
    // withdraw
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      BAL_RETH_WETH_LP.address,
      WITHDRAW_AMOUNT
    );
    await auraRETHWETHVault
      .connect(deployer.signer)
      .withdrawCollateral(BAL_RETH_WETH_LP.address, amountAssetToWithdraw, 9900, deployer.address);

    const afterBalanceOfUser = await BAL_RETH_WETH_LP.balanceOf(deployer.address);

    expect(dola3crvBalanceOfPool).to.be.equal(0);
    expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(BAL_RETH_WETH_LP.address, WITHDRAW_AMOUNT)
    );
    expect(await BAL_RETH_WETH_LP.balanceOf(auraRETHWETHVault.address)).to.be.equal(0);
  });
});

makeSuite('AuraRETHWETHVault - Process Yield', (testEnv: TestEnv) => {
  it('send yield to YieldManager', async () => {
    const { auraRETHWETHVault, users, BAL_RETH_WETH_LP, BAL, AURA, yieldManager } = testEnv;
    const borrower = users[1];

    // borrower provides RETHWETH
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      BAL_RETH_WETH_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, borrower, assetAmountToDeposit);
    await BAL_RETH_WETH_LP.connect(borrower.signer).approve(
      auraRETHWETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );
    await auraRETHWETHVault
      .connect(borrower.signer)
      .depositCollateral(BAL_RETH_WETH_LP.address, assetAmountToDeposit);
    const beforeBalanceOfBAL = await BAL.balanceOf(yieldManager.address);
    const beforeBalanceOfAURA = await AURA.balanceOf(yieldManager.address);

    // Simulate yield
    await advanceBlock((await timeLatest()).plus(AURA_YIELD_PERIOD).toNumber());

    // process yield, so all yield should be sent to YieldManager
    await auraRETHWETHVault.processYield();

    const afterBalanceOfBAL = await BAL.balanceOf(yieldManager.address);
    const afterBalanceOfAURA = await AURA.balanceOf(yieldManager.address);
    expect(afterBalanceOfBAL).to.be.gt(beforeBalanceOfBAL);
    expect(afterBalanceOfAURA).to.be.gt(beforeBalanceOfAURA);
  });
});
