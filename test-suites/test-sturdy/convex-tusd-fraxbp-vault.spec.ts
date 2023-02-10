/**
 * @dev test for ConvexTUSDFRAXBPVault functions
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
  const { TUSD_FRAXBP_LP } = testEnv;
  const ethers = (DRE as any).ethers;

  const LPOwnerAddress = '0x5180db0237291A6449DdA9ed33aD90a38787621c';
  await impersonateAccountsHardhat([LPOwnerAddress]);
  const signer = await ethers.provider.getSigner(LPOwnerAddress);

  //transfer to borrower
  await TUSD_FRAXBP_LP.connect(signer).transfer(user.address, amount);
};

makeSuite('ConvexTUSDFRAXBPVault - Deposit & Withdraw', (testEnv: TestEnv) => {
  it('should be reverted if try to use an invalid token as collateral', async () => {
    const { convexTUSDFRAXBPVault } = testEnv;
    await expect(convexTUSDFRAXBPVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith('82');
  });
  it('should be reverted if try to use any of coin other than TUSD-FRAXBP as collateral', async () => {
    const { usdc, convexTUSDFRAXBPVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(convexTUSDFRAXBPVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith(
      '82'
    );
  });
  it('deposit TUSD-FRAXBP for collateral', async () => {
    const { convexTUSDFRAXBPVault, deployer, cvxtusd_fraxbp, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP } =
      testEnv;

    // Prepare some TUSD_FRAXBP_LP for depositor
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      TUSD_FRAXBP_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

    // allow token transfer to this vault
    await TUSD_FRAXBP_LP.connect(deployer.signer).approve(
      convexTUSDFRAXBPVault.address,
      assetAmountToDeposit
    );

    // deposit collateral
    await convexTUSDFRAXBPVault
      .connect(deployer.signer)
      .depositCollateral(TUSD_FRAXBP_LP.address, assetAmountToDeposit);

    expect(await TUSD_FRAXBP_LP.balanceOf(deployer.address)).to.be.equal(0);
    expect(await cvxtusd_fraxbp.balanceOf(convexTUSDFRAXBPVault.address)).to.be.equal(0);
    expect(await aCVXTUSD_FRAXBP.balanceOf(convexTUSDFRAXBPVault.address)).to.be.equal(0);
    expect(await aCVXTUSD_FRAXBP.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
  });

  it('transferring aCVXTUSD_FRAXBP should be success after deposit TUSD_FRAXBP_LP', async () => {
    const { aCVXTUSD_FRAXBP, deployer, users } = testEnv;
    await expect(
      aCVXTUSD_FRAXBP
        .connect(deployer.signer)
        .transfer(
          users[0].address,
          await convertToCurrencyDecimals(aCVXTUSD_FRAXBP.address, TRANSFER_ATOKEN_AMOUNT)
        )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, convexTUSDFRAXBPVault, TUSD_FRAXBP_LP } = testEnv;

    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      TUSD_FRAXBP_LP.address,
      DEPOSIT_AMOUNT
    );
    await expect(
      convexTUSDFRAXBPVault.withdrawCollateral(
        TUSD_FRAXBP_LP.address,
        amountAssetToWithdraw,
        9900,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, cvxtusd_fraxbp, convexTUSDFRAXBPVault, TUSD_FRAXBP_LP } = testEnv;
    const tusdfraxbpBalanceOfPool = await cvxtusd_fraxbp.balanceOf(convexTUSDFRAXBPVault.address);
    const beforeBalanceOfUser = await TUSD_FRAXBP_LP.balanceOf(deployer.address);
    // withdraw
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      TUSD_FRAXBP_LP.address,
      WITHDRAW_AMOUNT
    );
    await convexTUSDFRAXBPVault
      .connect(deployer.signer)
      .withdrawCollateral(TUSD_FRAXBP_LP.address, amountAssetToWithdraw, 9900, deployer.address);

    const afterBalanceOfUser = await TUSD_FRAXBP_LP.balanceOf(deployer.address);

    expect(tusdfraxbpBalanceOfPool).to.be.equal(0);
    expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, WITHDRAW_AMOUNT)
    );
    expect(await TUSD_FRAXBP_LP.balanceOf(convexTUSDFRAXBPVault.address)).to.be.equal(0);
  });
});

makeSuite('ConvexTUSDFRAXBPVault - Process Yield', (testEnv: TestEnv) => {
  it('send yield to YieldManager', async () => {
    const { convexTUSDFRAXBPVault, users, TUSD_FRAXBP_LP, CRV, CVX, yieldManager } = testEnv;
    const borrower = users[1];

    // borrower provides TUSDFRAXBP
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      TUSD_FRAXBP_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, borrower, assetAmountToDeposit);
    await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
      convexTUSDFRAXBPVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );
    await convexTUSDFRAXBPVault
      .connect(borrower.signer)
      .depositCollateral(TUSD_FRAXBP_LP.address, assetAmountToDeposit);
    expect(await convexTUSDFRAXBPVault.getYieldAmount()).to.be.equal(0);
    const beforeBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const beforeBalanceOfCVX = await CVX.balanceOf(yieldManager.address);

    // Simulate yield
    await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());

    // process yield, so all yield should be sent to YieldManager
    await convexTUSDFRAXBPVault.processYield();

    const afterBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const afterBalanceOfCVX = await CVX.balanceOf(yieldManager.address);
    expect(afterBalanceOfCRV).to.be.gt(beforeBalanceOfCRV);
    expect(afterBalanceOfCVX).to.be.gt(beforeBalanceOfCVX);
  });
});

// makeSuite('ConvexTUSDFRAXBPVault - Whitelist feature', (testEnv: TestEnv) => {
//   it('Only allow whitelist user to deposit', async () => {
//     const { convexTUSDFRAXBPVault, deployer, cvxtusd_fraxbp, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP, vaultWhitelist, users } =
//       testEnv;

//     // Prepare some TUSD_FRAXBP_LP for depositor
//     const assetAmountToDeposit = await convertToCurrencyDecimals(
//       TUSD_FRAXBP_LP.address,
//       DEPOSIT_AMOUNT
//     );
//     await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

//     // allow token transfer to this vault
//     await TUSD_FRAXBP_LP.connect(deployer.signer).approve(
//       convexTUSDFRAXBPVault.address,
//       assetAmountToDeposit
//     );

//     await vaultWhitelist.connect(owner.signer).addAddressesToWhitelistUser(convexTUSDFRAXBPVault.address, [deployer.address]);
//     await expect(
//       convexTUSDFRAXBPVault
//         .connect(users[1].signer)
//         .depositCollateral(TUSD_FRAXBP_LP.address, assetAmountToDeposit)
//     ).to.be.revertedWith('118');

//     await convexTUSDFRAXBPVault
//       .connect(deployer.signer)
//       .depositCollateral(TUSD_FRAXBP_LP.address, assetAmountToDeposit);

//     expect(await TUSD_FRAXBP_LP.balanceOf(deployer.address)).to.be.equal(0);
//     expect(await cvxtusd_fraxbp.balanceOf(convexTUSDFRAXBPVault.address)).to.be.equal(0);
//     expect(await aCVXTUSD_FRAXBP.balanceOf(convexTUSDFRAXBPVault.address)).to.be.equal(0);
//     expect(await aCVXTUSD_FRAXBP.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
//   });

//   it('Only allow whitelist user to withdraw', async () => {
//     const { deployer, cvxtusd_fraxbp, convexTUSDFRAXBPVault, TUSD_FRAXBP_LP, vaultWhitelist, users } = testEnv;
//     const tusdfraxbpBalanceOfPool = await cvxtusd_fraxbp.balanceOf(convexTUSDFRAXBPVault.address);
//     const beforeBalanceOfUser = await TUSD_FRAXBP_LP.balanceOf(deployer.address);
//     // withdraw
//     const amountAssetToWithdraw = await convertToCurrencyDecimals(
//       TUSD_FRAXBP_LP.address,
//       WITHDRAW_AMOUNT
//     );

//     await expect(
//       convexTUSDFRAXBPVault
//         .connect(users[1].signer)
//         .withdrawCollateral(TUSD_FRAXBP_LP.address, amountAssetToWithdraw, 9900, deployer.address)
//     ).to.be.revertedWith('118');

//     await convexTUSDFRAXBPVault
//       .connect(deployer.signer)
//       .withdrawCollateral(TUSD_FRAXBP_LP.address, amountAssetToWithdraw, 5900, deployer.address);

//     await vaultWhitelist.connect(owner.signer).removeAddressesFromWhitelistUser(convexTUSDFRAXBPVault.address, [deployer.address]);
//     expect(await vaultWhitelist.connect(owner.signer).whitelistUserCount(convexTUSDFRAXBPVault.address)).to.be.equal(0);

//     const afterBalanceOfUser = await TUSD_FRAXBP_LP.balanceOf(deployer.address);

//     expect(tusdfraxbpBalanceOfPool).to.be.equal(0);
//     expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
//       await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, WITHDRAW_AMOUNT)
//     );
//     expect(await TUSD_FRAXBP_LP.balanceOf(convexTUSDFRAXBPVault.address)).to.be.equal(0);
//   });
// });
