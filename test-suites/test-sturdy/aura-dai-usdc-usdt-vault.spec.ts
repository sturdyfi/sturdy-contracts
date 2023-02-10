// /**
//  * @dev test for AuraDAIUSDCUSDTVault functions
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

// // Constant to simulate aura yield, it indicates that time period.
// const AURA_YIELD_PERIOD = 100000;

// // Constants related to asset amount during test
// const DEPOSIT_AMOUNT = '3000';
// const TRANSFER_ATOKEN_AMOUNT = '1000';
// const WITHDRAW_AMOUNT = '2000'; // = deposit - transfer

// const prepareCollateralForUser = async (
//   testEnv: TestEnv,
//   user: SignerWithAddress,
//   amount: BigNumberish
// ) => {
//   const { BAL_DAI_USDC_USDT_LP } = testEnv;
//   const ethers = (DRE as any).ethers;

//   const LPOwnerAddress = '0x1229a70535ab7Cf4b102405eD36e23C9d69Ec0F9';
//   await impersonateAccountsHardhat([LPOwnerAddress]);
//   const signer = await ethers.provider.getSigner(LPOwnerAddress);

//   //transfer to borrower
//   await BAL_DAI_USDC_USDT_LP.connect(signer).transfer(user.address, amount);
// };

// makeSuite('AuraDAIUSDCUSDTVault - Deposit & Withdraw', (testEnv: TestEnv) => {
//   it('should be reverted if try to use an invalid token as collateral', async () => {
//     const { auraDAIUSDCUSDTVault } = testEnv;
//     await expect(auraDAIUSDCUSDTVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith('82');
//   });
//   it('should be reverted if try to use any of coin other than BAL-DAI-USDC-USDT as collateral', async () => {
//     const { usdc, auraDAIUSDCUSDTVault } = testEnv;
//     // TODO @bshevchenko: use Error const instead of 82
//     await expect(auraDAIUSDCUSDTVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith(
//       '82'
//     );
//   });
//   it('deposit BAL-DAI-USDC-USDT for collateral', async () => {
//     const {
//       auraDAIUSDCUSDTVault,
//       deployer,
//       auradai_usdc_usdt,
//       aAURADAI_USDC_USDT,
//       BAL_DAI_USDC_USDT_LP,
//     } = testEnv;

//     // Prepare some BAL_DAI_USDC_USDT_LP for depositor
//     const assetAmountToDeposit = await convertToCurrencyDecimals(
//       BAL_DAI_USDC_USDT_LP.address,
//       DEPOSIT_AMOUNT
//     );
//     await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

//     // allow token transfer to this vault
//     await BAL_DAI_USDC_USDT_LP.connect(deployer.signer).approve(
//       auraDAIUSDCUSDTVault.address,
//       assetAmountToDeposit
//     );

//     // deposit collateral
//     await auraDAIUSDCUSDTVault
//       .connect(deployer.signer)
//       .depositCollateral(BAL_DAI_USDC_USDT_LP.address, assetAmountToDeposit);

//     expect(await BAL_DAI_USDC_USDT_LP.balanceOf(deployer.address)).to.be.equal(0);
//     expect(await auradai_usdc_usdt.balanceOf(auraDAIUSDCUSDTVault.address)).to.be.equal(0);
//     expect(await aAURADAI_USDC_USDT.balanceOf(auraDAIUSDCUSDTVault.address)).to.be.equal(0);
//     expect(await aAURADAI_USDC_USDT.balanceOf(deployer.address)).to.be.gte(assetAmountToDeposit);
//   });

//   it('transferring aAURADAI_USDC_USDT should be success after deposit BAL_DAI_USDC_USDT_LP', async () => {
//     const { aAURADAI_USDC_USDT, deployer, users } = testEnv;
//     await expect(
//       aAURADAI_USDC_USDT
//         .connect(deployer.signer)
//         .transfer(
//           users[0].address,
//           await convertToCurrencyDecimals(aAURADAI_USDC_USDT.address, TRANSFER_ATOKEN_AMOUNT)
//         )
//     ).to.not.be.reverted;
//   });

//   it('withdraw from collateral should be failed if user has not enough balance', async () => {
//     const { deployer, auraDAIUSDCUSDTVault, BAL_DAI_USDC_USDT_LP } = testEnv;

//     const amountAssetToWithdraw = await convertToCurrencyDecimals(
//       BAL_DAI_USDC_USDT_LP.address,
//       DEPOSIT_AMOUNT
//     );
//     await expect(
//       auraDAIUSDCUSDTVault.withdrawCollateral(
//         BAL_DAI_USDC_USDT_LP.address,
//         amountAssetToWithdraw,
//         9900,
//         deployer.address
//       )
//     ).to.be.reverted;
//   });

//   it('withdraw from collateral', async () => {
//     const { deployer, auradai_usdc_usdt, auraDAIUSDCUSDTVault, BAL_DAI_USDC_USDT_LP } = testEnv;
//     const BalanceOfPool = await auradai_usdc_usdt.balanceOf(auraDAIUSDCUSDTVault.address);
//     const beforeBalanceOfUser = await BAL_DAI_USDC_USDT_LP.balanceOf(deployer.address);
//     // withdraw
//     const amountAssetToWithdraw = await convertToCurrencyDecimals(
//       BAL_DAI_USDC_USDT_LP.address,
//       WITHDRAW_AMOUNT
//     );
//     await auraDAIUSDCUSDTVault
//       .connect(deployer.signer)
//       .withdrawCollateral(
//         BAL_DAI_USDC_USDT_LP.address,
//         amountAssetToWithdraw,
//         9900,
//         deployer.address
//       );

//     const afterBalanceOfUser = await BAL_DAI_USDC_USDT_LP.balanceOf(deployer.address);

//     expect(BalanceOfPool).to.be.equal(0);
//     expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
//       await convertToCurrencyDecimals(BAL_DAI_USDC_USDT_LP.address, WITHDRAW_AMOUNT)
//     );
//     expect(await BAL_DAI_USDC_USDT_LP.balanceOf(auraDAIUSDCUSDTVault.address)).to.be.equal(0);
//   });
// });

// makeSuite('auraDAIUSDCUSDTVault - Process Yield', (testEnv: TestEnv) => {
//   it('send yield to YieldManager', async () => {
//     const { auraDAIUSDCUSDTVault, users, BAL_DAI_USDC_USDT_LP, BAL, AURA, yieldManager } = testEnv;
//     const borrower = users[1];

//     // borrower provides BALDAIUSDCUSDT
//     const assetAmountToDeposit = await convertToCurrencyDecimals(
//       BAL_DAI_USDC_USDT_LP.address,
//       DEPOSIT_AMOUNT
//     );
//     await prepareCollateralForUser(testEnv, borrower, assetAmountToDeposit);
//     await BAL_DAI_USDC_USDT_LP.connect(borrower.signer).approve(
//       auraDAIUSDCUSDTVault.address,
//       APPROVAL_AMOUNT_LENDING_POOL
//     );
//     await auraDAIUSDCUSDTVault
//       .connect(borrower.signer)
//       .depositCollateral(BAL_DAI_USDC_USDT_LP.address, assetAmountToDeposit);
//     expect(await auraDAIUSDCUSDTVault.getYieldAmount()).to.be.equal(0);
//     const beforeBalanceOfBAL = await BAL.balanceOf(yieldManager.address);
//     const beforeBalanceOfAURA = await AURA.balanceOf(yieldManager.address);

//     // Simulate yield
//     await advanceBlock((await timeLatest()).plus(AURA_YIELD_PERIOD).toNumber());

//     // process yield, so all yield should be sent to YieldManager
//     await auraDAIUSDCUSDTVault.processYield();

//     const afterBalanceOfBAL = await BAL.balanceOf(yieldManager.address);
//     const afterBalanceOfAURA = await AURA.balanceOf(yieldManager.address);
//     expect(afterBalanceOfBAL).to.be.gt(beforeBalanceOfBAL);
//     expect(afterBalanceOfAURA).to.be.gt(beforeBalanceOfAURA);
//   });
// });
