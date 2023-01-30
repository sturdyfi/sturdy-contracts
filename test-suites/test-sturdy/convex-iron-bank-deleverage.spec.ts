// import BigNumber from 'bignumber.js';
// import { BigNumberish } from 'ethers';
// import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
// import { oneEther, ZERO_ADDRESS } from '../../helpers/constants';
// import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
// import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
// import { getVariableDebtToken } from '../../helpers/contracts-getters';
// import { MintableERC20 } from '../../types';
// import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';

// const chai = require('chai');
// const { expect } = chai;

// const getCollateralLevSwapper = async (testEnv: TestEnv, collateral: tEthereumAddress) => {
//   const { levSwapManager, deployer } = testEnv;
//   const levSwapAddress = await levSwapManager.getLevSwapper(collateral);
//   return IGeneralLevSwap__factory.connect(levSwapAddress, deployer.signer);
// };

// const mint = async (
//   reserveSymbol: string,
//   amount: string,
//   user: SignerWithAddress,
//   testEnv: TestEnv
// ) => {
//   const { usdc, dai, usdt, IRON_BANK_LP } = testEnv;
//   const ethers = (DRE as any).ethers;
//   let ownerAddress;
//   let token;

//   if (reserveSymbol == 'USDC') {
//     ownerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
//     token = usdc;
//   } else if (reserveSymbol == 'DAI') {
//     ownerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
//     token = dai;
//   } else if (reserveSymbol == 'USDT') {
//     ownerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
//     token = usdt;
//   } else if (reserveSymbol == 'IRON_BANK_LP') {
//     ownerAddress = '0x2D2421fF1b3b35e1ca8A20eb89Fb79803b304c01';
//     token = IRON_BANK_LP;
//   }

//   await impersonateAccountsHardhat([ownerAddress]);
//   const signer = await ethers.provider.getSigner(ownerAddress);
//   await waitForTx(await token.connect(signer).transfer(user.address, amount));
// };

// const calcTotalBorrowAmount = async (
//   testEnv: TestEnv,
//   collateral: tEthereumAddress,
//   amount: BigNumberish,
//   ltv: BigNumberish,
//   iterations: number,
//   borrowingAsset: tEthereumAddress
// ) => {
//   const { oracle } = testEnv;
//   const collateralPrice = await oracle.getAssetPrice(collateral);
//   const borrowingAssetPrice = await oracle.getAssetPrice(borrowingAsset);

//   const amountToBorrow = await convertToCurrencyDecimals(
//     borrowingAsset,
//     new BigNumber(amount.toString())
//       .multipliedBy(collateralPrice.toString())
//       .multipliedBy(ltv.toString())
//       .div(10000)
//       .multipliedBy(iterations)
//       .div(borrowingAssetPrice.toString())
//       .toFixed(0)
//   );

//   return amountToBorrow;
// };

// const calcCollateralAmountFromEth = async (
//   testEnv: TestEnv,
//   collateral: tEthereumAddress,
//   ethAmount: BigNumberish
// ) => {
//   const { oracle } = testEnv;
//   const collateralPrice = await oracle.getAssetPrice(collateral);

//   const amount = await convertToCurrencyDecimals(
//     collateral,
//     new BigNumber(ethAmount.toString()).div(collateralPrice.toString()).toFixed(0)
//   );

//   return amount;
// };

// const depositToLendingPool = async (
//   token: MintableERC20,
//   user: SignerWithAddress,
//   amount: string,
//   testEnv: TestEnv
// ) => {
//   const { pool } = testEnv;
//   // Approve
//   await token.connect(user.signer).approve(pool.address, amount);
//   // Depoist
//   await pool.connect(user.signer).deposit(token.address, amount, user.address, '0');
// };

// makeSuite('IRONBANK Deleverage without Flashloan', (testEnv) => {
//   const { INVALID_HF } = ProtocolErrors;
//   const LPAmount = '200';
//   const iterations = 3;
//   const slippage = '100';
//   let ironbankLevSwap = {} as IGeneralLevSwap;
//   let ltv = '';

//   before(async () => {
//     const { helpersContract, cvxiron_bank } = testEnv;
//     ironbankLevSwap = await getCollateralLevSwapper(testEnv, cvxiron_bank.address);
//     ltv = (await helpersContract.getReserveConfigurationData(cvxiron_bank.address)).ltv.toString();
//   });
//   describe('leavePosition(): Prerequisite checker', () => {
//     it('should be reverted if try to use zero amount', async () => {
//       const { dai, aCVXIRON_BANK } = testEnv;
//       const principalAmount = 0;
//       await expect(
//         ironbankLevSwap.leavePosition(
//           principalAmount,
//           slippage,
//           iterations,
//           dai.address,
//           aCVXIRON_BANK.address
//         )
//       ).to.be.revertedWith('113');
//     });
//     it('should be reverted if try to use invalid stable coin', async () => {
//       const { aDai, aCVXIRON_BANK } = testEnv;
//       const principalAmount = 10;
//       await expect(
//         ironbankLevSwap.leavePosition(
//           principalAmount,
//           slippage,
//           iterations,
//           aDai.address,
//           aCVXIRON_BANK.address
//         )
//       ).to.be.revertedWith('114');
//     });
//     it('should be reverted if try to use zero address as a aToken', async () => {
//       const { dai } = testEnv;
//       const principalAmount = 10;
//       await expect(
//         ironbankLevSwap.leavePosition(
//           principalAmount,
//           slippage,
//           iterations,
//           dai.address,
//           ZERO_ADDRESS
//         )
//       ).to.be.revertedWith('112');
//     });
//   });
//   describe('leavePosition() - full amount:', async () => {
//     it('USDT as borrowing asset', async () => {
//       const { users, usdt, aCVXIRON_BANK, IRON_BANK_LP, pool, helpersContract } = testEnv;

//       const depositor = users[0];
//       const borrower = users[1];
//       const principalAmount = (
//         await convertToCurrencyDecimals(IRON_BANK_LP.address, LPAmount)
//       ).toString();
//       const amountToDelegate = (
//         await calcTotalBorrowAmount(
//           testEnv,
//           IRON_BANK_LP.address,
//           LPAmount,
//           ltv,
//           iterations,
//           usdt.address
//         )
//       ).toString();

//       // Deposit USDT to Lending Pool
//       await mint('USDT', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(usdt, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPosition(principalAmount, iterations, ltv, usdt.address);

//       const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

//       expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );

//       const beforeBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

//       const balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(principalAmount, '100', '10', usdt.address, aCVXIRON_BANK.address);

//       const afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
//         '99'
//       );
//     });
//     it('USDC as borrowing asset', async () => {
//       const { users, usdc, IRON_BANK_LP, aCVXIRON_BANK, pool, helpersContract } = testEnv;
//       const depositor = users[0];
//       const borrower = users[2];
//       const principalAmount = (
//         await convertToCurrencyDecimals(IRON_BANK_LP.address, LPAmount)
//       ).toString();
//       const amountToDelegate = (
//         await calcTotalBorrowAmount(
//           testEnv,
//           IRON_BANK_LP.address,
//           LPAmount,
//           ltv,
//           iterations,
//           usdc.address
//         )
//       ).toString();
//       // Depositor deposits USDC to Lending Pool
//       await mint('USDC', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(usdc, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPosition(principalAmount, iterations, ltv, usdc.address);

//       const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

//       expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );

//       const beforeBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

//       const balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(principalAmount, '100', '10', usdc.address, aCVXIRON_BANK.address);

//       const afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
//         '99'
//       );
//     });
//     it('DAI as borrowing asset', async () => {
//       const { users, dai, IRON_BANK_LP, aCVXIRON_BANK, pool, helpersContract } = testEnv;
//       const depositor = users[0];
//       const borrower = users[3];
//       const principalAmount = (
//         await convertToCurrencyDecimals(IRON_BANK_LP.address, LPAmount)
//       ).toString();
//       const amountToDelegate = (
//         await calcTotalBorrowAmount(
//           testEnv,
//           IRON_BANK_LP.address,
//           LPAmount,
//           ltv,
//           iterations,
//           dai.address
//         )
//       ).toString();

//       await mint('DAI', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPosition(principalAmount, iterations, ltv, dai.address);

//       const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

//       expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );

//       const beforeBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

//       const balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(principalAmount, '100', '10', dai.address, aCVXIRON_BANK.address);

//       const afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
//         '99'
//       );
//     });
//   });
// });

// makeSuite('IRONBANK Deleverage without Flashloan', (testEnv) => {
//   const { INVALID_HF } = ProtocolErrors;
//   const LPAmount = '200';
//   const iterations = 3;
//   let ironbankLevSwap = {} as IGeneralLevSwap;
//   let ltv = '';

//   before(async () => {
//     const { helpersContract, cvxiron_bank } = testEnv;
//     ironbankLevSwap = await getCollateralLevSwapper(testEnv, cvxiron_bank.address);
//     ltv = (await helpersContract.getReserveConfigurationData(cvxiron_bank.address)).ltv.toString();
//   });
//   describe('leavePosition() - partial amount:', async () => {
//     it('USDT as borrowing asset', async () => {
//       const { users, usdt, aUsdt, aCVXIRON_BANK, IRON_BANK_LP, pool, helpersContract } = testEnv;

//       const depositor = users[0];
//       const borrower = users[1];
//       const principalAmount = (
//         await convertToCurrencyDecimals(IRON_BANK_LP.address, LPAmount)
//       ).toString();
//       const amountToDelegate = (
//         await calcTotalBorrowAmount(
//           testEnv,
//           IRON_BANK_LP.address,
//           LPAmount,
//           ltv,
//           iterations,
//           usdt.address
//         )
//       ).toString();

//       // Deposit USDT to Lending Pool
//       await mint('USDT', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(usdt, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPosition(principalAmount, iterations, ltv, usdt.address);

//       const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

//       expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

//       const beforeBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

//       //de-leverage 10% amount
//       let balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           (Number(principalAmount) / 10).toFixed(),
//           '100',
//           '10',
//           usdt.address,
//           aCVXIRON_BANK.address
//         );

//       let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       let afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(
//         afterBalanceOfBorrower
//           .mul('100')
//           .div((Number(principalAmount) / 10).toFixed())
//           .toString()
//       ).to.be.bignumber.gte('99');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 10% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 20% amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(principalAmount) / 10) * 2).toFixed(),
//           '100',
//           '10',
//           usdt.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(
//         afterBalanceOfBorrower
//           .mul('100')
//           .div(((Number(principalAmount) / 10) * 3).toFixed())
//           .toString()
//       ).to.be.bignumber.gte('99');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 20% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 30% amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(principalAmount) / 10) * 3).toFixed(),
//           '100',
//           '10',
//           usdt.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(
//         afterBalanceOfBorrower
//           .mul('100')
//           .div(((Number(principalAmount) / 10) * 6).toFixed())
//           .toString()
//       ).to.be.bignumber.gte('99');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 30% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 40% amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(principalAmount) / 10) * 4).toFixed(),
//           '100',
//           '10',
//           usdt.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
//         '99'
//       );
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 40% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );
//     });
//     it('USDC as borrowing asset', async () => {
//       const { users, usdc, aCVXIRON_BANK, IRON_BANK_LP, pool, helpersContract } = testEnv;

//       const depositor = users[0];
//       const borrower = users[2];
//       const principalAmount = (
//         await convertToCurrencyDecimals(IRON_BANK_LP.address, LPAmount)
//       ).toString();
//       const amountToDelegate = (
//         await calcTotalBorrowAmount(
//           testEnv,
//           IRON_BANK_LP.address,
//           LPAmount,
//           ltv,
//           iterations,
//           usdc.address
//         )
//       ).toString();

//       // Deposit USDC to Lending Pool
//       await mint('USDC', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(usdc, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPosition(principalAmount, iterations, ltv, usdc.address);

//       const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

//       expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

//       const beforeBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

//       //de-leverage 10% amount
//       let balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           (Number(principalAmount) / 10).toFixed(),
//           '100',
//           '10',
//           usdc.address,
//           aCVXIRON_BANK.address
//         );

//       let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       let afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(
//         afterBalanceOfBorrower
//           .mul('100')
//           .div((Number(principalAmount) / 10).toFixed())
//           .toString()
//       ).to.be.bignumber.gte('99');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 10% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 20% amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(principalAmount) / 10) * 2).toFixed(),
//           '100',
//           '10',
//           usdc.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(
//         afterBalanceOfBorrower
//           .mul('100')
//           .div(((Number(principalAmount) / 10) * 3).toFixed())
//           .toString()
//       ).to.be.bignumber.gte('99');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 20% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 30% amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(principalAmount) / 10) * 3).toFixed(),
//           '100',
//           '10',
//           usdc.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(
//         afterBalanceOfBorrower
//           .mul('100')
//           .div(((Number(principalAmount) / 10) * 6).toFixed())
//           .toString()
//       ).to.be.bignumber.gte('99');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 30% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 40% amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(principalAmount) / 10) * 4).toFixed(),
//           '100',
//           '10',
//           usdc.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
//         '99'
//       );
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 40% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );
//     });
//     it('DAI as borrowing asset', async () => {
//       const { users, dai, aCVXIRON_BANK, IRON_BANK_LP, pool, helpersContract } = testEnv;

//       const depositor = users[0];
//       const borrower = users[3];
//       const principalAmount = (
//         await convertToCurrencyDecimals(IRON_BANK_LP.address, LPAmount)
//       ).toString();
//       const amountToDelegate = (
//         await calcTotalBorrowAmount(
//           testEnv,
//           IRON_BANK_LP.address,
//           LPAmount,
//           ltv,
//           iterations,
//           dai.address
//         )
//       ).toString();

//       // Deposit DAI to Lending Pool
//       await mint('DAI', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPosition(principalAmount, iterations, ltv, dai.address);

//       const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

//       expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

//       const beforeBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

//       //de-leverage 10% amount
//       let balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           (Number(principalAmount) / 10).toFixed(),
//           '100',
//           '10',
//           dai.address,
//           aCVXIRON_BANK.address
//         );

//       let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       let afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(
//         afterBalanceOfBorrower
//           .mul('100')
//           .div((Number(principalAmount) / 10).toFixed())
//           .toString()
//       ).to.be.bignumber.gte('99');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 10% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 20% amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(principalAmount) / 10) * 2).toFixed(),
//           '100',
//           '10',
//           dai.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(
//         afterBalanceOfBorrower
//           .mul('100')
//           .div(((Number(principalAmount) / 10) * 3).toFixed())
//           .toString()
//       ).to.be.bignumber.gte('99');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 20% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 30% amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(principalAmount) / 10) * 3).toFixed(),
//           '100',
//           '10',
//           dai.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(
//         afterBalanceOfBorrower
//           .mul('100')
//           .div(((Number(principalAmount) / 10) * 6).toFixed())
//           .toString()
//       ).to.be.bignumber.gte('99');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 30% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 40% amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(principalAmount) / 10) * 4).toFixed(),
//           '100',
//           '10',
//           dai.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
//         '99'
//       );
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 40% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );
//     });
//   });
// });

// makeSuite('IRONBANK Deleverage without Flashloan', (testEnv) => {
//   const { INVALID_HF } = ProtocolErrors;
//   const LPAmount = '200';
//   const slippage = '100';
//   const iterations = 3;
//   let ironbankLevSwap = {} as IGeneralLevSwap;
//   let ltv = '';

//   before(async () => {
//     const { helpersContract, cvxiron_bank } = testEnv;
//     ironbankLevSwap = await getCollateralLevSwapper(testEnv, cvxiron_bank.address);
//     ltv = (await helpersContract.getReserveConfigurationData(cvxiron_bank.address)).ltv.toString();
//   });
//   describe('leavePosition() - increase healthFactor:', async () => {
//     it('USDT as borrowing asset', async () => {
//       const { users, usdt, aUsdt, aCVXIRON_BANK, IRON_BANK_LP, pool, helpersContract } = testEnv;

//       const depositor = users[0];
//       const borrower = users[1];
//       const principalAmount = (
//         await convertToCurrencyDecimals(IRON_BANK_LP.address, LPAmount)
//       ).toString();
//       const amountToDelegate = (
//         await calcTotalBorrowAmount(
//           testEnv,
//           IRON_BANK_LP.address,
//           LPAmount,
//           ltv,
//           iterations,
//           usdt.address
//         )
//       ).toString();

//       // Deposit USDT to Lending Pool
//       await mint('USDT', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(usdt, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPosition(principalAmount, iterations, ltv, usdt.address);

//       const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

//       expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

//       const collateralAmountFromDebt = (
//         await calcCollateralAmountFromEth(
//           testEnv,
//           IRON_BANK_LP.address,
//           userGlobalDataAfterEnter.totalDebtETH
//         )
//       ).toString();
//       const beforeBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

//       //de-leverage 10% debt amount
//       let balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           (Number(collateralAmountFromDebt) / 10).toFixed(),
//           '100',
//           '0',
//           usdt.address,
//           aCVXIRON_BANK.address
//         );

//       let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       let afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 10% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 20% debt amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(collateralAmountFromDebt) / 10) * 2).toFixed(),
//           '100',
//           '0',
//           usdt.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 20% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 30% debt amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(collateralAmountFromDebt) / 10) * 3).toFixed(),
//           '100',
//           '0',
//           usdt.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 30% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 40% debt amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(collateralAmountFromDebt) / 10) * 4).toFixed(),
//           '100',
//           '0',
//           usdt.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 40% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );
//     });
//     it('USDC as borrowing asset', async () => {
//       const { users, usdc, aCVXIRON_BANK, IRON_BANK_LP, pool, helpersContract } = testEnv;

//       const depositor = users[0];
//       const borrower = users[2];
//       const principalAmount = (
//         await convertToCurrencyDecimals(IRON_BANK_LP.address, LPAmount)
//       ).toString();
//       const amountToDelegate = (
//         await calcTotalBorrowAmount(
//           testEnv,
//           IRON_BANK_LP.address,
//           LPAmount,
//           ltv,
//           iterations,
//           usdc.address
//         )
//       ).toString();

//       // Deposit USDC to Lending Pool
//       await mint('USDC', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(usdc, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPosition(principalAmount, iterations, ltv, usdc.address);

//       const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

//       expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

//       const collateralAmountFromDebt = (
//         await calcCollateralAmountFromEth(
//           testEnv,
//           IRON_BANK_LP.address,
//           userGlobalDataAfterEnter.totalDebtETH
//         )
//       ).toString();
//       const beforeBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

//       //de-leverage 10% debt amount
//       let balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           (Number(collateralAmountFromDebt) / 10).toFixed(),
//           '100',
//           '0',
//           usdc.address,
//           aCVXIRON_BANK.address
//         );

//       let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       let afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 10% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 20% debt amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(collateralAmountFromDebt) / 10) * 2).toFixed(),
//           '100',
//           '0',
//           usdc.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 20% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 30% debt amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(collateralAmountFromDebt) / 10) * 3).toFixed(),
//           '100',
//           '0',
//           usdc.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 30% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 40% debt amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(collateralAmountFromDebt) / 10) * 4).toFixed(),
//           '100',
//           '0',
//           usdc.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 40% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );
//     });
//     it('DAI as borrowing asset', async () => {
//       const { users, dai, aCVXIRON_BANK, IRON_BANK_LP, pool, helpersContract } = testEnv;

//       const depositor = users[0];
//       const borrower = users[3];
//       const principalAmount = (
//         await convertToCurrencyDecimals(IRON_BANK_LP.address, LPAmount)
//       ).toString();
//       const amountToDelegate = (
//         await calcTotalBorrowAmount(
//           testEnv,
//           IRON_BANK_LP.address,
//           LPAmount,
//           ltv,
//           iterations,
//           dai.address
//         )
//       ).toString();

//       // Deposit DAI to Lending Pool
//       await mint('DAI', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPosition(principalAmount, iterations, ltv, dai.address);

//       const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

//       expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

//       const collateralAmountFromDebt = (
//         await calcCollateralAmountFromEth(
//           testEnv,
//           IRON_BANK_LP.address,
//           userGlobalDataAfterEnter.totalDebtETH
//         )
//       ).toString();
//       const beforeBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

//       //de-leverage 10% debt amount
//       let balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           (Number(collateralAmountFromDebt) / 10).toFixed(),
//           '100',
//           '0',
//           dai.address,
//           aCVXIRON_BANK.address
//         );

//       let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       let afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 10% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 20% debt amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(collateralAmountFromDebt) / 10) * 2).toFixed(),
//           '100',
//           '0',
//           dai.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 20% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 30% debt amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(collateralAmountFromDebt) / 10) * 3).toFixed(),
//           '100',
//           '0',
//           dai.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 30% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );

//       //de-leverage 40% debt amount
//       balanceInSturdy = await aCVXIRON_BANK.balanceOf(borrower.address);
//       await aCVXIRON_BANK
//         .connect(borrower.signer)
//         .approve(ironbankLevSwap.address, balanceInSturdy.mul(2));

//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .leavePosition(
//           ((Number(collateralAmountFromDebt) / 10) * 4).toFixed(),
//           '100',
//           '0',
//           dai.address,
//           aCVXIRON_BANK.address
//         );

//       userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
//       afterBalanceOfBorrower = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
//       expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//       console.log(
//         'leavePosition 40% HealthFactor: ',
//         userGlobalDataAfterLeave.healthFactor.toString()
//       );
//     });
//   });
// });
