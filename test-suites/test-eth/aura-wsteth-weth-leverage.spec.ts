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

const chai = require('chai');
const { expect } = chai;
const { parseEther } = ethers.utils;

const getCollateralLevSwapper = async (testEnv: TestEnv, collateral: tEthereumAddress) => {
  const { levSwapManager, deployer } = testEnv;
  const levSwapAddress = await levSwapManager.getLevSwapper(collateral);
  return GeneralLevSwapFactory.connect(levSwapAddress, deployer.signer);
};

const mint = async (
  reserveSymbol: string,
  amount: string,
  user: SignerWithAddress,
  testEnv: TestEnv
) => {
  const { weth, BAL_WSTETH_WETH_LP } = testEnv;
  const ethers = (DRE as any).ethers;
  let ownerAddress;
  let token;

  if (reserveSymbol == 'WETH') {
    ownerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    token = weth;
  } else if (reserveSymbol == 'BAL_WSTETH_WETH_LP') {
    ownerAddress = '0x8627425d8b3c16d16683a1e1e17ff00a2596e05f';
    token = BAL_WSTETH_WETH_LP;
  }

  await impersonateAccountsHardhat([ownerAddress]);
  const signer = await ethers.provider.getSigner(ownerAddress);
  await waitForTx(await token.connect(signer).transfer(user.address, amount));
};

const calcTotalBorrowAmount = async (
  testEnv: TestEnv,
  collateral: tEthereumAddress,
  amount: BigNumberish,
  ltv: BigNumberish,
  iterations: number,
  borrowingAsset: tEthereumAddress
) => {
  const { oracle } = testEnv;
  const collateralPrice = await oracle.getAssetPrice(collateral);
  const borrowingAssetPrice = await oracle.getAssetPrice(borrowingAsset);

  const amountToBorrow = await convertToCurrencyDecimals(
    borrowingAsset,
    new BigNumber(amount.toString())
      .multipliedBy(collateralPrice.toString())
      .multipliedBy(ltv.toString())
      .div(10000)
      .multipliedBy(iterations)
      .div(borrowingAssetPrice.toString())
      .toFixed(0)
  );

  return amountToBorrow;
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
  const iterations = 3;
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
      const coins = (await wstethwethLevSwap.getAvailableStableCoins()).map((coin) =>
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
        wstethwethLevSwap.enterPosition(principalAmount, iterations, ltv, stableCoin)
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { aWeth } = testEnv;
      const principalAmount = 10;
      const stableCoin = aWeth.address;
      await expect(
        wstethwethLevSwap.enterPosition(principalAmount, iterations, ltv, stableCoin)
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
          .enterPosition(principalAmount, iterations, ltv, stableCoin)
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
          iterations,
          weth.address
        )
      ).toString();

      // Deposit WETH to Lending Pool
      await mint('WETH', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(weth, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('BAL_WSTETH_WETH_LP', principalAmount, borrower, testEnv);
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
        .enterPosition(principalAmount, iterations, ltv, weth.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
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
          iterations,
          weth.address
        )
      ).toString();
      // Depositor deposits WETH to Lending Pool
      await mint('WETH', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(weth, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('BAL_WSTETH_WETH_LP', principalAmount, borrower, testEnv);
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
        .enterPosition(principalAmount, iterations, ltv, weth.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
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
          iterations,
          weth.address
        )
      ).toString();

      await mint('WETH', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(weth, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('BAL_WSTETH_WETH_LP', principalAmount, borrower, testEnv);
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
        .enterPosition(principalAmount, iterations, ltv, weth.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
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
      await mint('WETH', borrowedAmount.toString(), borrower, testEnv);
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
      mint('WETH', amountToLiquidate, liquidator, testEnv);
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
