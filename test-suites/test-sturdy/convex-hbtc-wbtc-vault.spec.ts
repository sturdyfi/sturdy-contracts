// /**
//  * @dev test for ConvexHBTCWBTCVault functions
//  */

// import { expect } from 'chai';
// import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
// import { BigNumberish } from 'ethers';
// import {
//   DRE,
//   impersonateAccountsHardhat,
//   advanceBlock,
//   timeLatest,
// } from '../../helpers/misc-utils';
// import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
// import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';

// // Constant to simulate convex yield, it indicates that time period.
// const CONVEX_YIELD_PERIOD = 100000;

// // Constants related to asset amount during test
// const DEPOSIT_AMOUNT = '0.03';
// const TRANSFER_ATOKEN_AMOUNT = '0.01';
// const WITHDRAW_AMOUNT = '0.02'; // = deposit - transfer

// const prepareCollateralForUser = async (
//   testEnv: TestEnv,
//   user: SignerWithAddress,
//   amount: BigNumberish
// ) => {
//   const { HBTC_WBTC_LP } = testEnv;
//   const ethers = (DRE as any).ethers;

//   const LPOwnerAddress = '0xd41f7006bcb2b3d0f9c5873272ebed67b37f80dc';
//   await impersonateAccountsHardhat([LPOwnerAddress]);
//   const signer = await ethers.provider.getSigner(LPOwnerAddress);

//   //transfer to borrower
//   await HBTC_WBTC_LP.connect(signer).transfer(user.address, amount);
// };

// makeSuite('ConvexHBTCWBTCVault - Deposit & Withdraw', (testEnv: TestEnv) => {
//   it('should be reverted if try to use an invalid token as collateral', async () => {
//     const { convexHBTCWBTCVault } = testEnv;
//     await expect(convexHBTCWBTCVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith('82');
//   });
//   it('should be reverted if try to use any of coin other than hCRV as collateral', async () => {
//     const { usdc, convexHBTCWBTCVault } = testEnv;
//     // TODO @bshevchenko: use Error const instead of 82
//     await expect(convexHBTCWBTCVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith(
//       '82'
//     );
//   });
//   it('deposit hCRV for collateral', async () => {
//     const { convexHBTCWBTCVault, deployer, cvxhbtc_wbtc, aCVXHBTC_WBTC, HBTC_WBTC_LP } = testEnv;

//     // Prepare some HBTC_WBTC_LP for depositor
//     const assetAmountToDeposit = await convertToCurrencyDecimals(
//       HBTC_WBTC_LP.address,
//       DEPOSIT_AMOUNT
//     );
//     await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

//     // allow token transfer to this vault
//     await HBTC_WBTC_LP.connect(deployer.signer).approve(
//       convexHBTCWBTCVault.address,
//       assetAmountToDeposit
//     );

//     // deposit collateral
//     await convexHBTCWBTCVault
//       .connect(deployer.signer)
//       .depositCollateral(HBTC_WBTC_LP.address, assetAmountToDeposit);

//     expect(await HBTC_WBTC_LP.balanceOf(deployer.address)).to.be.equal(0);
//     expect(await cvxhbtc_wbtc.balanceOf(convexHBTCWBTCVault.address)).to.be.equal(0);
//     expect(await aCVXHBTC_WBTC.balanceOf(convexHBTCWBTCVault.address)).to.be.equal(0);
//     expect(await aCVXHBTC_WBTC.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
//   });

//   it('transferring aCVXHBTC_WBTC should be success after deposit HBTC_WBTC_LP', async () => {
//     const { aCVXHBTC_WBTC, deployer, users } = testEnv;
//     await expect(
//       aCVXHBTC_WBTC
//         .connect(deployer.signer)
//         .transfer(
//           users[0].address,
//           await convertToCurrencyDecimals(aCVXHBTC_WBTC.address, TRANSFER_ATOKEN_AMOUNT)
//         )
//     ).to.not.be.reverted;
//   });

//   it('withdraw from collateral should be failed if user has not enough balance', async () => {
//     const { deployer, convexHBTCWBTCVault, HBTC_WBTC_LP } = testEnv;

//     const amountAssetToWithdraw = await convertToCurrencyDecimals(
//       HBTC_WBTC_LP.address,
//       DEPOSIT_AMOUNT
//     );
//     await expect(
//       convexHBTCWBTCVault.withdrawCollateral(
//         HBTC_WBTC_LP.address,
//         amountAssetToWithdraw,
//         9900,
//         deployer.address
//       )
//     ).to.be.reverted;
//   });

//   it('withdraw from collateral', async () => {
//     const { deployer, aCVXHBTC_WBTC, convexHBTCWBTCVault, HBTC_WBTC_LP } = testEnv;
//     const dola3crvBalanceOfPool = await aCVXHBTC_WBTC.balanceOf(convexHBTCWBTCVault.address);
//     const beforeBalanceOfUser = await HBTC_WBTC_LP.balanceOf(deployer.address);
//     // withdraw
//     const amountAssetToWithdraw = await convertToCurrencyDecimals(
//       HBTC_WBTC_LP.address,
//       WITHDRAW_AMOUNT
//     );
//     await convexHBTCWBTCVault
//       .connect(deployer.signer)
//       .withdrawCollateral(HBTC_WBTC_LP.address, amountAssetToWithdraw, 9900, deployer.address);

//     const afterBalanceOfUser = await HBTC_WBTC_LP.balanceOf(deployer.address);

//     expect(dola3crvBalanceOfPool).to.be.equal(0);
//     expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
//       await convertToCurrencyDecimals(HBTC_WBTC_LP.address, WITHDRAW_AMOUNT)
//     );
//     expect(await HBTC_WBTC_LP.balanceOf(convexHBTCWBTCVault.address)).to.be.equal(0);
//   });
// });

// makeSuite('convexHBTCWBTCVault - Process Yield', (testEnv: TestEnv) => {
//   it('send yield to YieldManager', async () => {
//     const { convexHBTCWBTCVault, users, HBTC_WBTC_LP, CRV, CVX, yieldManager } = testEnv;
//     const borrower = users[1];

//     // borrower provides hCRV
//     const assetAmountToDeposit = await convertToCurrencyDecimals(
//       HBTC_WBTC_LP.address,
//       DEPOSIT_AMOUNT
//     );
//     await prepareCollateralForUser(testEnv, borrower, assetAmountToDeposit);
//     await HBTC_WBTC_LP.connect(borrower.signer).approve(
//       convexHBTCWBTCVault.address,
//       APPROVAL_AMOUNT_LENDING_POOL
//     );
//     await convexHBTCWBTCVault
//       .connect(borrower.signer)
//       .depositCollateral(HBTC_WBTC_LP.address, assetAmountToDeposit);
//     expect(await convexHBTCWBTCVault.getYieldAmount()).to.be.equal(0);
//     const beforeBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
//     const beforeBalanceOfCVX = await CVX.balanceOf(yieldManager.address);

//     // Simulate yield
//     await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());

//     // process yield, so all yield should be sent to YieldManager
//     await convexHBTCWBTCVault.processYield();

//     const afterBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
//     const afterBalanceOfCVX = await CVX.balanceOf(yieldManager.address);
//     expect(afterBalanceOfCRV).to.be.gt(beforeBalanceOfCRV);
//     expect(afterBalanceOfCVX).to.be.gt(beforeBalanceOfCVX);
//   });
// });
