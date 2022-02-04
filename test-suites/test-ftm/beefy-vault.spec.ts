// /**
//  * @dev test for beefyVault functions
//  */

// import { expect } from 'chai';
// import { makeSuite, TestEnv } from './helpers/make-suite';
// import { ethers } from 'ethers';
// import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
// import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';
// import { printDivider } from './helpers/utils/helpers';
// import { convertToCurrencyDecimals, getEthersSigners } from '../../helpers/contracts-helpers';
// import { SignerWithAddress } from '../test-sturdy/helpers/make-suite';

// const { parseEther } = ethers.utils;

// let amountWETHtoDeposit = parseEther('1');

// makeSuite('beefyVault', (testEnv: TestEnv) => {
//   it('failed deposit for collateral without WETH', async () => {
//     const { beefyVault } = testEnv;
//     await expect(beefyVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.reverted;
//   });

//   it('deposit WETH for collateral', async () => {
//     const { beefyVault, deployer, mooweth, aMOOWETH, WETH, addressesProvider } = testEnv;
//     const ethers = (DRE as any).ethers;

//     // Make some test WETH for depositor
//     const wethOwnerAddress = '0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe';
//     await impersonateAccountsHardhat([wethOwnerAddress]);
//     let signer = await ethers.provider.getSigner(wethOwnerAddress);
//     await WETH.connect(signer).Swapin(
//       '0x6af483697065dda1e50693750662adb39012699bbdb49d908d682a275a83c4cf', // TODO random tx hash
//       deployer.address,
//       amountWETHtoDeposit
//     );
//     expect(await WETH.balanceOf(deployer.address)).to.be.equal(amountWETHtoDeposit);
//     await WETH.approve(beefyVault.address, amountWETHtoDeposit);

//     await beefyVault.depositCollateral(WETH.address, amountWETHtoDeposit);

//     expect(await mooweth.balanceOf(beefyVault.address)).to.be.equal(0);
//     expect(await mooweth.balanceOf(aMOOWETH.address)).to.be.gt(954400); // TODO balance varies
//     expect(await aMOOWETH.balanceOf(beefyVault.address)).to.be.equal(0);
//     expect(await aMOOWETH.balanceOf(deployer.address)).to.be.gte(amountWETHtoDeposit - 1);
//     expect(await ethers.getDefaultProvider().getBalance(beefyVault.address)).to.be.equal(0);
//   });

//   it('transferring aMOOWETH should be success after deposit WETH', async () => {
//     const { aMOOWETH, users } = testEnv;
//     await expect(aMOOWETH.transfer(users[0].address, 100)).to.not.be.reverted;
//   });

//   it('withdraw from collateral should be failed if user has not enough balance', async () => {
//     const { deployer, beefyVault, WETH } = testEnv;
//     await expect(beefyVault.withdrawCollateral(WETH.address, amountWETHtoDeposit, deployer.address))
//       .to.be.reverted;
//   });

//   it('withdraw from collateral', async () => {
//     const { deployer, mooweth, beefyVault, WETH } = testEnv;
//     const mooWETHBalanceOfPool = await mooweth.balanceOf(beefyVault.address);
//     const wethBeforeBalanceOfUser = await WETH.balanceOf(deployer.address);

//     const amountWETHtoWithdraw = amountWETHtoDeposit - 200;

//     await beefyVault.withdrawCollateral(WETH.address, amountWETHtoWithdraw, deployer.address);

//     const wethCurrentBalanceOfUser = await WETH.balanceOf(deployer.address);
//     expect(mooWETHBalanceOfPool).to.be.equal(0);
//     expect(wethCurrentBalanceOfUser.sub(wethBeforeBalanceOfUser)).to.be.gte(
//       amountWETHtoWithdraw - 1 // TODO why - 1?
//     );
//     expect(await WETH.balanceOf(beefyVault.address)).to.be.equal(0);
//   });
// });

// makeSuite('beefyVault - use other coin as collateral', (testEnv) => {
//   it('Should revert to use any of coin other than WETH as collateral', async () => {
//     const { usdc, beefyVault } = testEnv;
//     // TODO @bshevchenko: use Error const instead of 82
//     await expect(beefyVault.depositCollateral(usdc.address, 1000)).to.be.revertedWith('82');
//   });
// });

// makeSuite('beefyVault', (testEnv: TestEnv) => {
//   it('distribute yield to supplier for single asset', async () => {
//     const { pool, beefyVault, usdc, users, WETH, mooweth, aMOOWETH, aUsdc } = testEnv;
//     const depositor = users[0];
//     const borrower = users[1];
//     const ethers = (DRE as any).ethers;
//     const usdcOwnerAddress = '0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe';
//     const depositUSDC = '7000';

//     // Make some test USDC for depositor
//     await impersonateAccountsHardhat([usdcOwnerAddress]);
//     let signer = await ethers.provider.getSigner(usdcOwnerAddress);
//     const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
//     await usdc.connect(signer).Swapin(
//       '0x6af483697065dda1e50693750662adb39012699bbdb49d908d682a275a83c4cf', // TODO random tx hash
//       depositor.address,
//       amountUSDCtoDeposit
//     );
//     expect(await usdc.balanceOf(depositor.address)).to.equal(amountUSDCtoDeposit);

//     // approve protocol to access depositor wallet
//     await usdc.connect(depositor.signer).approve(pool.address, amountUSDCtoDeposit);

//     // Supplier deposits USDC
//     await pool
//       .connect(depositor.signer)
//       .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

//     const wethOwnerAddress = '0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe';
//     await impersonateAccountsHardhat([wethOwnerAddress]);
//     signer = await ethers.provider.getSigner(wethOwnerAddress);
//     await WETH.connect(signer).Swapin(
//       '0x6af483697065dda1e50693750662adb39012699bbdb49d908d682a275a83c4cf', // TODO random tx hash
//       borrower.address,
//       amountWETHtoDeposit
//     );
//     expect(await WETH.balanceOf(borrower.address)).to.be.equal(amountWETHtoDeposit);

//     // approve protocol to access borrower wallet
//     await WETH.connect(borrower.signer).approve(beefyVault.address, amountWETHtoDeposit);

//     // deposit collateral to borrow
//     await beefyVault.connect(borrower.signer).depositCollateral(WETH.address, amountWETHtoDeposit);
//     expect(await beefyVault.getYieldAmount()).to.be.equal(0);

//     // To simulate yield in lendingPool, deposit some mooWETH to aMOOWETH contract
//     const mooWETHOwnerAddress = '0x0bb4c8d035b091e15b95b98bc742ab95e75e0398';
//     const yieldMOOWETHAmount = parseEther('1');
//     await impersonateAccountsHardhat([mooWETHOwnerAddress]);
//     signer = await ethers.provider.getSigner(mooWETHOwnerAddress);
//     await mooweth.connect(signer).transfer(aMOOWETH.address, yieldMOOWETHAmount);

//     expect(await beefyVault.getYieldAmount()).to.be.gt(parseEther('0.999'));
//     expect(await usdc.balanceOf(beefyVault.address)).to.be.equal(0);
//     expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(amountUSDCtoDeposit);

//     // process yield, so all yield should be converted to usdc
//     await beefyVault.processYield();
//     const yieldUSDC = await convertToCurrencyDecimals(usdc.address, '8000');
//     expect(await aUsdc.balanceOf(depositor.address)).to.be.gt(yieldUSDC);
//   });
// });

// // TODO
