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
import { APPROVAL_AMOUNT_LENDING_POOL } from '../../helpers/constants';

const { parseEther } = ethers.utils;

// // should pass on block number 14610081 on forked ftm without deploy case
// makeSuite('Liquidator', (testEnv: TestEnv) => {
//   it('call liquidator for RETH_WSTETH_LP', async () => {
//     const { liquidator, deployer, usdc, RETH_WSTETH_LP, yearnRETHWstETHVault, pool, oracle, users, yvreth_wsteth } = testEnv;
//     const ethers = (DRE as any).ethers;
//     const depositor = users[0];
//     const borrower = users[1];
//     const abiEncoder = new ethers.utils.AbiCoder();
//     const encodedData = abiEncoder.encode(
//       ["address", "address"],
//       [RETH_WSTETH_LP.address, borrower.address]
//     );

//     // Make some test RETH_WSTETH_LP for depositor
//     const depositRETHWstETHAmount = await convertToCurrencyDecimals(RETH_WSTETH_LP.address, '10');
//     const rETHWstETHLPOwnerAddress = '0x427E51f03D287809ab684878AE2176BA347c8c25';
//     await impersonateAccountsHardhat([rETHWstETHLPOwnerAddress]);
//     let signer = await ethers.provider.getSigner(rETHWstETHLPOwnerAddress);
//     await RETH_WSTETH_LP.connect(signer).transfer(borrower.address, depositRETHWstETHAmount);

//     await RETH_WSTETH_LP.connect(borrower.signer).approve(yearnRETHWstETHVault.address, depositRETHWstETHAmount);

//     await yearnRETHWstETHVault.connect(borrower.signer).depositCollateral(RETH_WSTETH_LP.address, depositRETHWstETHAmount);

//     const usdcOwnerAddress = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
//     const depositUSDC = '50000';
//     //Make some test USDC for depositor
//     await impersonateAccountsHardhat([usdcOwnerAddress]);
//     signer = await ethers.provider.getSigner(usdcOwnerAddress);
//     const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, depositUSDC);
//     await usdc.connect(signer).transfer(depositor.address, amountUSDCtoDeposit);

//     //approve protocol to access depositor wallet
//     await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

//     //Supplier  deposits 50000 USDC
//     await pool
//       .connect(depositor.signer)
//       .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

//     // borrow
//     const userGlobalData = await pool.getUserAccountData(borrower.address);
//     const usdcPrice = await oracle.getAssetPrice(usdc.address);

//     const amountUSDCToBorrow = await convertToCurrencyDecimals(
//       usdc.address,
//       new BigNumber(userGlobalData.availableBorrowsETH.toString())
//         .div(usdcPrice.toString())
//         .multipliedBy(0.95)
//         .toFixed(0)
//     );

//     await pool
//       .connect(borrower.signer)
//       .borrow(usdc.address, amountUSDCToBorrow, RateMode.Variable, '0', borrower.address);

//     // set liquidation threshold 35%
//     const configurator = await getLendingPoolConfiguratorProxy();
//     await configurator.configureReserveAsCollateral(yvreth_wsteth.address, '3000', '3500', '10500');

//     // process liquidation by using flashloan contract
//     await liquidator.liquidation(usdc.address, await convertToCurrencyDecimals(usdc.address, '20000'), encodedData);

//     // withdraw remained usdc from flashloan contract
//     const beforeUsdcBalance = await usdc.balanceOf(deployer.address);
//     await liquidator.connect(deployer.signer).withdraw(usdc.address);
//     const usdcBalance = await usdc.balanceOf(deployer.address);
//     expect(usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))).to.eq(true);
//   });
// });
