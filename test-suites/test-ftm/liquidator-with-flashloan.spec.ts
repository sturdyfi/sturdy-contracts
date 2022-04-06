/**
 * @dev test for liquidation with flashloan contract
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { convertToCurrencyDecimals, getEthersSigners } from '../../helpers/contracts-helpers';
import { getLendingPoolConfiguratorProxy } from '../../helpers/contracts-getters';
import BigNumber from 'bignumber.js';
import { RateMode } from '../../helpers/types';

const { parseEther } = ethers.utils;

// // should pass on block number 34239888 on forked ftm without deploy case
// makeSuite('Liquidator', (testEnv: TestEnv) => {
//   it('call liquidator for WFTM', async () => {
//     const { liquidator, deployer, usdc, WFTM, yvwftm } = testEnv;
//     const ethers = (DRE as any).ethers;
//     const abiEncoder = new ethers.utils.AbiCoder();
//     const encodedData = abiEncoder.encode(
//       ["address", "address"],
//       [WFTM.address, deployer.address]
//     );
//     // set liquidation threshold 35%
//     await impersonateAccountsHardhat(['0x154D73802a6B3324c017481AC818050afE4a0b0A']);
//     let signer = await ethers.provider.getSigner('0x154D73802a6B3324c017481AC818050afE4a0b0A');
//     const configurator = await getLendingPoolConfiguratorProxy();
//     await configurator.connect(signer).configureReserveAsCollateral(yvwftm.address, '3000', '3500', '10500');

//     // process liquidation by using flashloan contract
//     await liquidator.liquidation(usdc.address, await convertToCurrencyDecimals(usdc.address, '100'), encodedData);
    
//     // withdraw remained usdc from flashloan contract
//     const beforeUsdcBalance = await usdc.balanceOf(deployer.address);
//     await liquidator.connect(deployer.signer).withdraw(usdc.address);
//     const usdcBalance = await usdc.balanceOf(deployer.address);
//     expect(usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))).to.eq(true);
//   });
// });

// // should pass on block number 35228321 on forked ftm without deploy case
// makeSuite('Liquidator', (testEnv: TestEnv) => {
//   it('call liquidator for fBEETS', async () => {
//     const { liquidator, deployer, usdc, fBEETS, yearnFBEETSVault, pool, oracle, yvfbeets } = testEnv;
//     const ethers = (DRE as any).ethers;
//     const borrower = (await getEthersSigners())[0];
//     const borrowerAddress = await borrower.getAddress();
//     const abiEncoder = new ethers.utils.AbiCoder();
//     const encodedData = abiEncoder.encode(
//       ["address", "address"],
//       [fBEETS.address, borrowerAddress]
//     );

//     // Make some test fBEETS for depositor
//     const amountfBEETStoDeposit = await convertToCurrencyDecimals(fBEETS.address, '100');
//     const fBEETSOwnerAddress = '0xe97178f627268f4cead069237db9f50f66d17d97';
//     await impersonateAccountsHardhat([fBEETSOwnerAddress]);
//     let signer = await ethers.provider.getSigner(fBEETSOwnerAddress);
//     await fBEETS.connect(signer).transfer(borrowerAddress, amountfBEETStoDeposit);
    
//     await fBEETS.connect(borrower).approve(yearnFBEETSVault.address, amountfBEETStoDeposit);

//     await yearnFBEETSVault.connect(borrower).depositCollateral(fBEETS.address, amountfBEETStoDeposit);

//     // borrow
//     const userGlobalData = await pool.getUserAccountData(borrowerAddress);
//     const usdcPrice = await oracle.getAssetPrice(usdc.address);

//     const amountUSDCToBorrow = await convertToCurrencyDecimals(
//       usdc.address,
//       new BigNumber(userGlobalData.availableBorrowsETH.toString())
//         .div(usdcPrice.toString())
//         .multipliedBy(0.95)
//         .toFixed(0)
//     );

//     await pool
//       .connect(borrower)
//       .borrow(usdc.address, amountUSDCToBorrow, RateMode.Variable, '0', borrowerAddress);

//     // set liquidation threshold 35%
//     await impersonateAccountsHardhat(['0x154D73802a6B3324c017481AC818050afE4a0b0A']);
//     signer = await ethers.provider.getSigner('0x154D73802a6B3324c017481AC818050afE4a0b0A');
//     const configurator = await getLendingPoolConfiguratorProxy();
//     await configurator.connect(signer).configureReserveAsCollateral(yvfbeets.address, '3000', '3500', '10500');

//     // process liquidation by using flashloan contract
//     await liquidator.liquidation(usdc.address, await convertToCurrencyDecimals(usdc.address, '100'), encodedData);
    
//     // withdraw remained usdc from flashloan contract
//     const beforeUsdcBalance = await usdc.balanceOf(deployer.address);
//     await liquidator.connect(deployer.signer).withdraw(usdc.address);
//     const usdcBalance = await usdc.balanceOf(deployer.address);
//     expect(usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))).to.eq(true);
//   });
// });

// // should pass on block number 35228321 on forked ftm without deploy case
// makeSuite('Liquidator', (testEnv: TestEnv) => {
//   it('call liquidator for LINK', async () => {
//     const { liquidator, deployer, usdc, LINK, yearnLINKVault, pool, oracle, yvlink } = testEnv;
//     const ethers = (DRE as any).ethers;
//     const borrower = (await getEthersSigners())[0];
//     const borrowerAddress = await borrower.getAddress();
//     const abiEncoder = new ethers.utils.AbiCoder();
//     const encodedData = abiEncoder.encode(
//       ["address", "address"],
//       [LINK.address, borrowerAddress]
//     );

//     // Make some test LINK for depositor
//     const amountLINKtoDeposit = await convertToCurrencyDecimals(LINK.address, '100');
//     const linkOwnerAddress = '0xa75ede99f376dd47f3993bc77037f61b5737c6ea';
//     await impersonateAccountsHardhat([linkOwnerAddress]);
//     let signer = await ethers.provider.getSigner(linkOwnerAddress);
//     await LINK.connect(signer).transfer(borrowerAddress, amountLINKtoDeposit);
    
//     await LINK.connect(borrower).approve(yearnLINKVault.address, amountLINKtoDeposit);

//     await yearnLINKVault.connect(borrower).depositCollateral(LINK.address, amountLINKtoDeposit);

//     // borrow
//     const userGlobalData = await pool.getUserAccountData(borrowerAddress);
//     const usdcPrice = await oracle.getAssetPrice(usdc.address);

//     const amountUSDCToBorrow = await convertToCurrencyDecimals(
//       usdc.address,
//       new BigNumber(userGlobalData.availableBorrowsETH.toString())
//         .div(usdcPrice.toString())
//         .multipliedBy(0.95)
//         .toFixed(0)
//     );

//     await pool
//       .connect(borrower)
//       .borrow(usdc.address, amountUSDCToBorrow, RateMode.Variable, '0', borrowerAddress);

//     // set liquidation threshold 35%
//     await impersonateAccountsHardhat(['0x154D73802a6B3324c017481AC818050afE4a0b0A']);
//     signer = await ethers.provider.getSigner('0x154D73802a6B3324c017481AC818050afE4a0b0A');
//     const configurator = await getLendingPoolConfiguratorProxy();
//     await configurator.connect(signer).configureReserveAsCollateral(yvlink.address, '3000', '3500', '10500');

//     // process liquidation by using flashloan contract
//     await liquidator.liquidation(usdc.address, await convertToCurrencyDecimals(usdc.address, '100'), encodedData);
    
//     // withdraw remained usdc from flashloan contract
//     const beforeUsdcBalance = await usdc.balanceOf(deployer.address);
//     await liquidator.connect(deployer.signer).withdraw(usdc.address);
//     const usdcBalance = await usdc.balanceOf(deployer.address);
//     expect(usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))).to.eq(true);
//   });
// });

// makeSuite('Liquidator', (testEnv: TestEnv) => {
//   it('call liquidator for WFTM', async () => {
//     const { liquidator, deployer, usdc, WFTM, yvwftm } = testEnv;
//     const ethers = (DRE as any).ethers;
//     const abiEncoder = new ethers.utils.AbiCoder();
//     const encodedData = abiEncoder.encode(
//       ["address", "address"],
//       [WFTM.address, deployer.address]
//     );
//     // set liquidation threshold 35%
//     await impersonateAccountsHardhat(['0x154D73802a6B3324c017481AC818050afE4a0b0A']);
//     let signer = await ethers.provider.getSigner('0x154D73802a6B3324c017481AC818050afE4a0b0A');
//     const configurator = await getLendingPoolConfiguratorProxy();
//     await configurator.connect(signer).configureReserveAsCollateral(yvwftm.address, '3000', '3500', '10500');

//     // process liquidation by using flashloan contract
//     await liquidator.liquidation(usdc.address, await convertToCurrencyDecimals(usdc.address, '100'), encodedData);
    
//     // withdraw remained usdc from flashloan contract
//     const beforeUsdcBalance = await usdc.balanceOf(deployer.address);
//     await liquidator.connect(deployer.signer).withdraw(usdc.address);
//     const usdcBalance = await usdc.balanceOf(deployer.address);
//     expect(usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))).to.eq(true);

//     // retry liquidation should be failed
//     await expect(liquidator.liquidation(usdc.address, await convertToCurrencyDecimals(usdc.address, '100'), encodedData)).to.be.reverted;
//   });
// });