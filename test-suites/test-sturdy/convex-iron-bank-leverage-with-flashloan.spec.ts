// import BigNumber from 'bignumber.js';
// import { ethers, BigNumberish } from 'ethers';
// import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
// import { oneEther } from '../../helpers/constants';
// import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
// import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
// import {
//   getVariableDebtToken,
//   getLendingPoolConfiguratorProxy,
// } from '../../helpers/contracts-getters';
// import { MintableERC20 } from '../../types';
// import { ProtocolErrors, RateMode, tEthereumAddress } from '../../helpers/types';
// import { getUserData } from './helpers/utils/helpers';
// import { IGeneralLevSwap__factory } from '../../types';
// import { IGeneralLevSwap } from '../../types';

// const chai = require('chai');
// const { expect } = chai;
// const { parseEther } = ethers.utils;

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
//   leverage: BigNumberish,
//   borrowingAsset: tEthereumAddress
// ) => {
//   const { oracle } = testEnv;
//   const collateralPrice = await oracle.getAssetPrice(collateral);
//   const borrowingAssetPrice = await oracle.getAssetPrice(borrowingAsset);

//   const amountToBorrow = await convertToCurrencyDecimals(
//     borrowingAsset,
//     new BigNumber(amount.toString())
//       .multipliedBy(leverage.toString())
//       .div(10000)
//       .plus(amount.toString())
//       .multipliedBy(collateralPrice.toString())
//       .multipliedBy(ltv.toString())
//       .multipliedBy(1.5) // make enough amount
//       .div(10000)
//       .div(borrowingAssetPrice.toString())
//       .toFixed(0)
//   );

//   return amountToBorrow;
// };

// const calcETHAmount = async (testEnv: TestEnv, asset: tEthereumAddress, amount: BigNumberish) => {
//   const { oracle } = testEnv;
//   const assetPrice = await oracle.getAssetPrice(asset);
//   const ethAmount = new BigNumber(amount.toString()).multipliedBy(assetPrice.toString()).toFixed(0);

//   return ethAmount;
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

// makeSuite('IRONBANK Leverage Swap', (testEnv) => {
//   const { INVALID_HF } = ProtocolErrors;
//   const LPAmount = '200';
//   const slippage = 70; // 0.7%

//   /// LTV = 0.8, slippage = 0.02, Aave fee = 0.0009
//   /// leverage / (1 + leverage) <= LTV / (1 + slippage) / (1 + Aave fee)
//   /// leverage / (1 + leverage) <= 0.8 / 1.02 / 1.0009 = 0.7836084
//   /// leverage <= 0.7836084 / (1 - 0.7836084) = 3.62125
//   const leverage = 36000;
//   let ironbankLevSwap = {} as IGeneralLevSwap;
//   let ltv = '';

//   before(async () => {
//     const { helpersContract, cvxiron_bank, vaultWhitelist, convexIronBankVault, users, owner } =
//       testEnv;
//     ironbankLevSwap = await getCollateralLevSwapper(testEnv, cvxiron_bank.address);
//     ltv = (await helpersContract.getReserveConfigurationData(cvxiron_bank.address)).ltv.toString();
//     await vaultWhitelist
//       .connect(owner.signer)
//       .addAddressToWhitelistContract(convexIronBankVault.address, ironbankLevSwap.address);
//     await vaultWhitelist
//       .connect(owner.signer)
//       .addAddressToWhitelistUser(convexIronBankVault.address, users[0].address);
//   });
//   describe('configuration', () => {
//     it('DAI, USDC, USDT should be available for borrowing.', async () => {
//       const { dai, usdc, usdt } = testEnv;
//       const coins = (await ironbankLevSwap.getAvailableStableCoins()).map((coin) =>
//         coin.toUpperCase()
//       );
//       expect(coins.length).to.be.equal(3);
//       expect(coins.includes(dai.address.toUpperCase())).to.be.equal(true);
//       expect(coins.includes(usdc.address.toUpperCase())).to.be.equal(true);
//       expect(coins.includes(usdt.address.toUpperCase())).to.be.equal(true);
//     });
//   });
//   describe('enterPosition(): Prerequisite checker', () => {
//     it('should be reverted if try to use zero amount', async () => {
//       const { dai } = testEnv;
//       const principalAmount = 0;
//       const stableCoin = dai.address;
//       await expect(
//         ironbankLevSwap.enterPositionWithFlashloan(
//           principalAmount,
//           leverage,
//           slippage,
//           stableCoin,
//           0
//         )
//       ).to.be.revertedWith('113');
//     });
//     it('should be reverted if try to use invalid stable coin', async () => {
//       const { aDai } = testEnv;
//       const principalAmount = 10;
//       const stableCoin = aDai.address;
//       await expect(
//         ironbankLevSwap.enterPositionWithFlashloan(
//           principalAmount,
//           leverage,
//           slippage,
//           stableCoin,
//           0
//         )
//       ).to.be.revertedWith('114');
//     });
//     it('should be reverted when collateral is not enough', async () => {
//       const { users, dai, IRON_BANK_LP } = testEnv;
//       const borrower = users[1];
//       const principalAmount = await convertToCurrencyDecimals(IRON_BANK_LP.address, '1000');
//       const stableCoin = dai.address;
//       await expect(
//         ironbankLevSwap
//           .connect(borrower.signer)
//           .enterPositionWithFlashloan(principalAmount, leverage, slippage, stableCoin, 0)
//       ).to.be.revertedWith('115');
//     });
//   });
//   describe('enterPosition():', async () => {
//     it('USDT as borrowing asset', async () => {
//       const {
//         users,
//         usdt,
//         IRON_BANK_LP,
//         pool,
//         helpersContract,
//         vaultWhitelist,
//         convexIronBankVault,
//         owner,
//       } = testEnv;

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
//           leverage,
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
//       await expect(
//         ironbankLevSwap
//           .connect(borrower.signer)
//           .enterPositionWithFlashloan(principalAmount, leverage, slippage, usdt.address, 0)
//       ).to.be.revertedWith('118');
//       await vaultWhitelist
//         .connect(owner.signer)
//         .addAddressToWhitelistUser(convexIronBankVault.address, borrower.address);
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPositionWithFlashloan(principalAmount, leverage, slippage, usdt.address, 0);

//       const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
//       const collateralETHAmount = await calcETHAmount(testEnv, IRON_BANK_LP.address, LPAmount);

//       expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       console.log('Expected Leverage: ', leverage / 10000 + 1);
//       console.log(
//         'Current Leverage: ',
//         new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
//           .div(collateralETHAmount)
//           .toString()
//       );
//       expect(
//         new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
//           .multipliedBy(10000)
//           .div(collateralETHAmount)
//           .toFixed()
//       ).to.be.bignumber.gt(leverage);
//       expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//     });
//     it('USDC as borrowing asset', async () => {
//       const {
//         users,
//         usdc,
//         IRON_BANK_LP,
//         pool,
//         helpersContract,
//         vaultWhitelist,
//         convexIronBankVault,
//         owner,
//       } = testEnv;
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
//           leverage,
//           usdc.address
//         )
//       ).toString();
//       // Depositor deposits USDT to Lending Pool
//       await mint('USDC', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(usdc, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await expect(
//         ironbankLevSwap
//           .connect(borrower.signer)
//           .enterPositionWithFlashloan(principalAmount, leverage, slippage, usdc.address, 0)
//       ).to.be.revertedWith('118');
//       await vaultWhitelist
//         .connect(owner.signer)
//         .addAddressToWhitelistUser(convexIronBankVault.address, borrower.address);
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPositionWithFlashloan(principalAmount, leverage, slippage, usdc.address, 0);

//       const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
//       const collateralETHAmount = await calcETHAmount(testEnv, IRON_BANK_LP.address, LPAmount);

//       expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       console.log('Expected Leverage: ', leverage / 10000 + 1);
//       console.log(
//         'Current Leverage: ',
//         new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
//           .div(collateralETHAmount)
//           .toString()
//       );
//       expect(
//         new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
//           .multipliedBy(10000)
//           .div(collateralETHAmount)
//           .toFixed()
//       ).to.be.bignumber.gt(leverage);
//       expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//     });
//     it('DAI as borrowing asset', async () => {
//       const {
//         users,
//         dai,
//         IRON_BANK_LP,
//         pool,
//         helpersContract,
//         vaultWhitelist,
//         convexIronBankVault,
//         owner,
//       } = testEnv;
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
//           leverage,
//           dai.address
//         )
//       ).toString();

//       await mint('DAI', amountToDelegate, depositor, testEnv);
//       await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

//       // Prepare Collateral
//       await mint('IRON_BANK_LP', principalAmount, borrower, testEnv);
//       await IRON_BANK_LP.connect(borrower.signer).approve(ironbankLevSwap.address, principalAmount);

//       // approve delegate borrow
//       const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
//       await varDebtToken
//         .connect(borrower.signer)
//         .approveDelegation(ironbankLevSwap.address, amountToDelegate);

//       const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
//       expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

//       // leverage
//       await expect(
//         ironbankLevSwap
//           .connect(borrower.signer)
//           .enterPositionWithFlashloan(principalAmount, leverage, slippage, dai.address, 0)
//       ).to.be.revertedWith('118');
//       await vaultWhitelist
//         .connect(owner.signer)
//         .addAddressToWhitelistUser(convexIronBankVault.address, borrower.address);
//       await ironbankLevSwap
//         .connect(borrower.signer)
//         .enterPositionWithFlashloan(principalAmount, leverage, slippage, dai.address, 0);

//       const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
//       const collateralETHAmount = await calcETHAmount(testEnv, IRON_BANK_LP.address, LPAmount);

//       expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
//       console.log('Expected Leverage: ', leverage / 10000 + 1);
//       console.log(
//         'Current Leverage: ',
//         new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
//           .div(collateralETHAmount)
//           .toString()
//       );
//       expect(
//         new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
//           .multipliedBy(10000)
//           .div(collateralETHAmount)
//           .toFixed()
//       ).to.be.bignumber.gt(leverage);
//       expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
//       expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );
//     });
//   });
//   describe('repay():', async () => {
//     it('USDT', async () => {
//       const { users, usdt, IRON_BANK_LP, pool, helpersContract } = testEnv;
//       const borrower = users[1];

//       let balance = await IRON_BANK_LP.balanceOf(borrower.address);
//       expect(balance).to.be.bignumber.equal('0');

//       // calculate borrowed amount
//       const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
//         .variableDebtTokenAddress;
//       const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
//       const borrowedAmount = await varDebtToken.balanceOf(borrower.address);

//       // prepare stable asset
//       await mint('USDT', borrowedAmount.toString(), borrower, testEnv);
//       await usdt.connect(borrower.signer).approve(pool.address, borrowedAmount);

//       // repay
//       await expect(
//         pool
//           .connect(borrower.signer)
//           .repay(usdt.address, borrowedAmount, RateMode.Variable, borrower.address)
//       ).to.not.be.reverted;
//     });
//   });
//   describe('liquidation:', async () => {
//     it('DAI', async () => {
//       const { users, dai, IRON_BANK_LP, pool, helpersContract, aCVXIRON_BANK, cvxiron_bank } =
//         testEnv;
//       const borrower = users[3];
//       const liquidator = users[4];

//       // check aToken balance for liquidator, borrower
//       const borrowerAtokenBalance = await aCVXIRON_BANK.balanceOf(borrower.address);
//       expect(borrowerAtokenBalance).to.be.bignumber.gt('0');

//       // check debt
//       const userReserveDataBefore = await getUserData(
//         pool,
//         helpersContract,
//         dai.address,
//         borrower.address
//       );
//       expect(userReserveDataBefore.currentVariableDebt.toString()).to.be.bignumber.gt('0');

//       // drop liquidation threshold
//       const configurator = await getLendingPoolConfiguratorProxy();
//       await configurator.configureReserveAsCollateral(
//         cvxiron_bank.address,
//         '3000',
//         '3200',
//         '10200'
//       );

//       const userGlobalData = await pool.getUserAccountData(borrower.address);
//       expect(userGlobalData.healthFactor.toString()).to.be.bignumber.lt(
//         oneEther.toFixed(0),
//         INVALID_HF
//       );

//       // liquidation
//       const amountToLiquidate = new BigNumber(userReserveDataBefore.currentVariableDebt.toString())
//         .div(2)
//         .toFixed(0);
//       mint('DAI', amountToLiquidate, liquidator, testEnv);
//       await dai.connect(liquidator.signer).approve(pool.address, amountToLiquidate);
//       await expect(
//         pool
//           .connect(liquidator.signer)
//           .liquidationCall(
//             IRON_BANK_LP.address,
//             dai.address,
//             borrower.address,
//             amountToLiquidate,
//             false
//           )
//       ).to.not.be.reverted;

//       const userReserveDataAfter = await getUserData(
//         pool,
//         helpersContract,
//         dai.address,
//         borrower.address
//       );

//       expect(userReserveDataAfter.currentVariableDebt.toString()).to.be.bignumber.lt(
//         userReserveDataBefore.currentVariableDebt.toString(),
//         'Invalid user borrow balance after liquidation'
//       );
//     });
//   });
// });
