import BigNumber from 'bignumber.js';
import { ethers, BigNumberish } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import {
  getVariableDebtToken,
  getLendingPoolConfiguratorProxy,
} from '../../helpers/contracts-getters';
import { GeneralLevSwapFactory, GeneralLevSwap, MintableERC20 } from '../../types';
import { ProtocolErrors, RateMode, tEthereumAddress } from '../../helpers/types';
import { getUserData } from './helpers/utils/helpers';
import { mint } from './helpers/mint';

const chai = require('chai');
const { expect } = chai;
const { parseEther } = ethers.utils;

const getCollateralLevSwapper = async (testEnv: TestEnv, collateral: tEthereumAddress) => {
  const { levSwapManager, deployer } = testEnv;
  const levSwapAddress = await levSwapManager.getLevSwapper(collateral);
  return GeneralLevSwapFactory.connect(levSwapAddress, deployer.signer);
};

const calcTotalBorrowAmount = async (
  testEnv: TestEnv,
  collateral: tEthereumAddress,
  amount: BigNumberish,
  ltv: BigNumberish,
  leverage: BigNumberish,
  borrowingAsset: tEthereumAddress
) => {
  const { oracle } = testEnv;
  const collateralPrice = await oracle.getAssetPrice(collateral);
  const borrowingAssetPrice = await oracle.getAssetPrice(borrowingAsset);

  const amountToBorrow = await convertToCurrencyDecimals(
    borrowingAsset,
    new BigNumber(amount.toString())
      .multipliedBy(leverage.toString())
      .div(10000)
      .plus(amount.toString())
      .multipliedBy(collateralPrice.toString())
      .multipliedBy(ltv.toString())
      .div(10000)
      .div(borrowingAssetPrice.toString())
      .toFixed(0)
  );

  return amountToBorrow;
};

const calcETHAmount = async (testEnv: TestEnv, asset: tEthereumAddress, amount: BigNumberish) => {
  const { oracle } = testEnv;
  const assetPrice = await oracle.getAssetPrice(asset);
  const ethAmount = new BigNumber(amount.toString()).multipliedBy(assetPrice.toString()).toFixed(0);

  return ethAmount;
};

const depositToLendingPool = async (
  token: MintableERC20,
  user: SignerWithAddress,
  amount: string,
  testEnv: TestEnv
) => {
  const { pool } = testEnv;
  // Approve
  await token.connect(user.signer).approve(pool.address, amount);
  // Depoist
  await pool.connect(user.signer).deposit(token.address, amount, user.address, '0');
};

makeSuite('WSTETHWETH Leverage Swap', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '2';
  const slippage = 100;

  /// LTV = 0.8, slippage = 0.02, Aave fee = 0.0009
  /// leverage / (1 + leverage) <= LTV / (1 + slippage) / (1 + Aave fee)
  /// leverage / (1 + leverage) <= 0.8 / 1.02 / 1.0009 = 0.7836084
  /// leverage <= 0.7836084 / (1 - 0.7836084) = 3.62125
  const leverage = 36000;
  let wstethwethLevSwap = {} as GeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, aurawsteth_weth } = testEnv;
    wstethwethLevSwap = await getCollateralLevSwapper(testEnv, aurawsteth_weth.address);
    ltv = (await helpersContract.getReserveConfigurationData(aurawsteth_weth.address)).ltv.toString();
  });
  describe('configuration', () => {
    it('WETH should be available for borrowing.', async () => {
      const { weth } = testEnv;
      const coins = (await wstethwethLevSwap.getAvailableBorrowingAssets()).map((coin) =>
        coin.toUpperCase()
      );
      expect(coins.length).to.be.equal(1);
      expect(coins.includes(weth.address.toUpperCase())).to.be.equal(true);
    });
  });
  describe('enterPosition(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { weth } = testEnv;
      const principalAmount = 0;
      const stableCoin = weth.address;
      await expect(
        wstethwethLevSwap.enterPositionWithFlashloan(principalAmount, leverage, slippage, stableCoin, 0)
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { aWeth } = testEnv;
      const principalAmount = 10;
      const stableCoin = aWeth.address;
      await expect(
        wstethwethLevSwap.enterPositionWithFlashloan(principalAmount, leverage, slippage, stableCoin, 0)
      ).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, weth, BAL_WSTETH_WETH_LP } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(BAL_WSTETH_WETH_LP.address, '1000');
      const stableCoin = weth.address;
      await expect(
        wstethwethLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, slippage, stableCoin, 0)
      ).to.be.revertedWith('115');
    });
  });
  describe('enterPosition():', async () => {
    it('WETH as borrowing asset', async () => {
      const { users, weth, BAL_WSTETH_WETH_LP, pool, helpersContract } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_WSTETH_WETH_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_WSTETH_WETH_LP.address,
          LPAmount,
          ltv,
          leverage,
          weth.address
        )
      ).toString();

      // Deposit WETH to Lending Pool
      await mint('WETH', amountToDelegate, depositor);
      await depositToLendingPool(weth, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('BAL_WSTETH_WETH_LP', principalAmount, borrower);
      await BAL_WSTETH_WETH_LP.connect(borrower.signer).approve(wstethwethLevSwap.address, principalAmount);

      // approve delegate borrow
      const wethDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(weth.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(wethDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(wstethwethLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await wstethwethLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, slippage, weth.address, 0);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
      const collateralETHAmount = await calcETHAmount(testEnv, BAL_WSTETH_WETH_LP.address, LPAmount);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      console.log('Expected Leverage: ', leverage / 10000 + 1);
      console.log(
        'Current Leverage: ',
        new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
          .div(collateralETHAmount)
          .toString()
      );
      expect(
        new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
          .multipliedBy(10000)
          .div(collateralETHAmount)
          .toFixed()
      ).to.be.bignumber.gt(leverage);
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
    it('WETH as borrowing asset', async () => {
      const { users, weth, BAL_WSTETH_WETH_LP, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_WSTETH_WETH_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_WSTETH_WETH_LP.address,
          LPAmount,
          ltv,
          leverage,
          weth.address
        )
      ).toString();
      // Depositor deposits WETH to Lending Pool
      await mint('WETH', amountToDelegate, depositor);
      await depositToLendingPool(weth, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('BAL_WSTETH_WETH_LP', principalAmount, borrower);
      await BAL_WSTETH_WETH_LP.connect(borrower.signer).approve(wstethwethLevSwap.address, principalAmount);

      // approve delegate borrow
      const wethDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(weth.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(wethDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(wstethwethLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await wstethwethLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, slippage, weth.address, 0);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
      const collateralETHAmount = await calcETHAmount(testEnv, BAL_WSTETH_WETH_LP.address, LPAmount);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      console.log('Expected Leverage: ', leverage / 10000 + 1);
      console.log(
        'Current Leverage: ',
        new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
          .div(collateralETHAmount)
          .toString()
      );
      expect(
        new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
          .multipliedBy(10000)
          .div(collateralETHAmount)
          .toFixed()
      ).to.be.bignumber.gt(leverage);
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
    it('WETH as borrowing asset', async () => {
      const { users, weth, BAL_WSTETH_WETH_LP, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_WSTETH_WETH_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_WSTETH_WETH_LP.address,
          LPAmount,
          ltv,
          leverage,
          weth.address
        )
      ).toString();

      await mint('WETH', amountToDelegate, depositor);
      await depositToLendingPool(weth, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('BAL_WSTETH_WETH_LP', principalAmount, borrower);
      await BAL_WSTETH_WETH_LP.connect(borrower.signer).approve(wstethwethLevSwap.address, principalAmount);

      // approve delegate borrow
      const wethDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(weth.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(wethDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(wstethwethLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await wstethwethLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, slippage, weth.address, 0);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
      const collateralETHAmount = await calcETHAmount(testEnv, BAL_WSTETH_WETH_LP.address, LPAmount);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      console.log('Expected Leverage: ', leverage / 10000 + 1);
      console.log(
        'Current Leverage: ',
        new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
          .div(collateralETHAmount)
          .toString()
      );
      expect(
        new BigNumber(userGlobalDataAfter.totalCollateralETH.toString())
          .multipliedBy(10000)
          .div(collateralETHAmount)
          .toFixed()
      ).to.be.bignumber.gt(leverage);
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
  });
  describe('repay():', async () => {
    it('WETH', async () => {
      const { users, weth, BAL_WSTETH_WETH_LP, pool, helpersContract } = testEnv;
      const borrower = users[1];

      let balance = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
      expect(balance).to.be.bignumber.equal('0');

      // calculate borrowed amount
      const wethDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(weth.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(wethDebtTokenAddress);
      const borrowedAmount = await varDebtToken.balanceOf(borrower.address);

      // prepare stable asset
      await mint('WETH', borrowedAmount.toString(), borrower);
      await weth.connect(borrower.signer).approve(pool.address, borrowedAmount);

      // repay
      await expect(
        pool
          .connect(borrower.signer)
          .repay(weth.address, borrowedAmount, RateMode.Variable, borrower.address)
      ).to.not.be.reverted;
    });
  });
  describe('liquidation:', async () => {
    it('WETH', async () => {
      const { users, weth, BAL_WSTETH_WETH_LP, pool, helpersContract, aAURAWSTETH_WETH, aurawsteth_weth } =
        testEnv;
      const borrower = users[3];
      const liquidator = users[4];

      // check aToken balance for liquidator, borrower
      const borrowerAtokenBalance = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      expect(borrowerAtokenBalance).to.be.bignumber.gt('0');

      // check debt
      const userReserveDataBefore = await getUserData(
        pool,
        helpersContract,
        weth.address,
        borrower.address
      );
      expect(userReserveDataBefore.currentVariableDebt.toString()).to.be.bignumber.gt('0');

      // drop liquidation threshold
      const configurator = await getLendingPoolConfiguratorProxy();
      await configurator.configureReserveAsCollateral(
        aurawsteth_weth.address,
        '3000',
        '3200',
        '10200'
      );

      const userGlobalData = await pool.getUserAccountData(borrower.address);
      expect(userGlobalData.healthFactor.toString()).to.be.bignumber.lt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      // liquidation
      const amountToLiquidate = new BigNumber(userReserveDataBefore.currentVariableDebt.toString())
        .div(2)
        .toFixed(0);
      mint('WETH', amountToLiquidate, liquidator);
      await weth.connect(liquidator.signer).approve(pool.address, amountToLiquidate);
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidationCall(
            BAL_WSTETH_WETH_LP.address,
            weth.address,
            borrower.address,
            amountToLiquidate,
            false
          )
      ).to.not.be.reverted;

      const userReserveDataAfter = await getUserData(
        pool,
        helpersContract,
        weth.address,
        borrower.address
      );

      expect(userReserveDataAfter.currentVariableDebt.toString()).to.be.bignumber.lt(
        userReserveDataBefore.currentVariableDebt.toString(),
        'Invalid user borrow balance after liquidation'
      );
    });
  });
});
