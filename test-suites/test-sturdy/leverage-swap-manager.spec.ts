import BigNumber from 'bignumber.js';
import { ethers, BigNumberish } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx, increaseTime } from '../../helpers/misc-utils';
import { APPROVAL_AMOUNT_LENDING_POOL, oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals, convertToCurrencyUnits } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { printUserAccountData, printDivider } from './helpers/utils/helpers';
import {
  getVariableDebtToken,
  getLendingPoolConfiguratorProxy,
} from '../../helpers/contracts-getters';
import type { ICurveExchange } from '../../types/ICurveExchange';
import { IERC20DetailedFactory } from '../../types/IERC20DetailedFactory';
import { GeneralLevSwapFactory, GeneralLevSwap, MintableERC20 } from '../../types';
import { ProtocolErrors, RateMode, tEthereumAddress } from '../../helpers/types';
import { getReserveData, getUserData } from './helpers/utils/helpers';

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
  const { usdc, dai, usdt, FRAX_3CRV_LP, DAI_USDC_USDT_SUSD_LP } = testEnv;
  const ethers = (DRE as any).ethers;
  let ownerAddress;
  let token;

  if (reserveSymbol == 'USDC') {
    ownerAddress = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
    token = usdc;
  } else if (reserveSymbol == 'DAI') {
    ownerAddress = '0x4967ec98748efb98490663a65b16698069a1eb35';
    token = dai;
  } else if (reserveSymbol == 'USDT') {
    ownerAddress = '0x5754284f345afc66a98fbB0a0Afe71e0F007B949';
    token = usdt;
  } else if (reserveSymbol == 'FRAX_3CRV_LP') {
    ownerAddress = '0x605b5f6549538a94bd2653d1ee67612a47039da0';
    token = FRAX_3CRV_LP;
  } else if (reserveSymbol == 'DAI_USDC_USDT_SUSD_LP') {
    ownerAddress = '0x1f9bB27d0C66fEB932f3F8B02620A128d072f3d8';
    token = DAI_USDC_USDT_SUSD_LP;
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

makeSuite('Leverage Swap Manger: configuration', (testEnv) => {});

makeSuite('FRAX3CRV Leverage Swap', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const iterations = 3;
  let fraxLevSwap = {} as GeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxfrax_3crv } = testEnv;
    fraxLevSwap = await getCollateralLevSwapper(testEnv, cvxfrax_3crv.address);
    ltv = (await helpersContract.getReserveConfigurationData(cvxfrax_3crv.address)).ltv.toString();
  });
  describe('configuration', () => {
    it('DAI, USDC, USDT should be available for borrowing.', async () => {
      const { dai, usdc, usdt } = testEnv;
      const coins = (await fraxLevSwap.getAvailableStableCoins()).map((coin) => coin.toUpperCase());
      expect(coins.length).to.be.equal(3);
      expect(coins.includes(dai.address.toUpperCase())).to.be.equal(true);
      expect(coins.includes(usdc.address.toUpperCase())).to.be.equal(true);
      expect(coins.includes(usdt.address.toUpperCase())).to.be.equal(true);
    });
  });
  describe('enterPosition(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { dai } = testEnv;
      const principalAmount = 0;
      const stableCoin = dai.address;
      await expect(
        fraxLevSwap.enterPosition(principalAmount, iterations, ltv, stableCoin)
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { aDai } = testEnv;
      const principalAmount = 10;
      const stableCoin = aDai.address;
      await expect(
        fraxLevSwap.enterPosition(principalAmount, iterations, ltv, stableCoin)
      ).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, dai, FRAX_3CRV_LP } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '1000');
      const stableCoin = dai.address;
      await expect(
        fraxLevSwap
          .connect(borrower.signer)
          .enterPosition(principalAmount, iterations, ltv, stableCoin)
      ).to.be.revertedWith('115');
    });
  });
  describe('enterPosition():', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, FRAX_3CRV_LP, pool, helpersContract } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_3CRV_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          FRAX_3CRV_LP.address,
          LPAmount,
          ltv,
          iterations,
          usdt.address
        )
      ).toString();

      // Deposit USDT to Lending Pool
      await mint('USDT', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(usdt, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('FRAX_3CRV_LP', principalAmount, borrower, testEnv);
      await FRAX_3CRV_LP.connect(borrower.signer).approve(fraxLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(fraxLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await fraxLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, usdt.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
    it('USDC as borrowing asset', async () => {
      const { users, usdc, FRAX_3CRV_LP, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_3CRV_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          FRAX_3CRV_LP.address,
          LPAmount,
          ltv,
          iterations,
          usdc.address
        )
      ).toString();
      // Depositor deposits USDT to Lending Pool
      await mint('USDC', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(usdc, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('FRAX_3CRV_LP', principalAmount, borrower, testEnv);
      await FRAX_3CRV_LP.connect(borrower.signer).approve(fraxLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(fraxLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await fraxLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, usdc.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
    it('DAI as borrowing asset', async () => {
      const { users, dai, FRAX_3CRV_LP, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_3CRV_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          FRAX_3CRV_LP.address,
          LPAmount,
          ltv,
          iterations,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('FRAX_3CRV_LP', principalAmount, borrower, testEnv);
      await FRAX_3CRV_LP.connect(borrower.signer).approve(fraxLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(fraxLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await fraxLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, dai.address);

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
    it('repay USDT, and withdraw collateral', async () => {
      const { users, usdt, FRAX_3CRV_LP, pool, helpersContract, convexFRAX3CRVVault } = testEnv;
      const borrower = users[1];

      let balance = await FRAX_3CRV_LP.balanceOf(borrower.address);
      expect(balance).to.be.bignumber.equal('0');

      // calculate borrowed amount
      const userReserveData = await getUserData(
        pool,
        helpersContract,
        usdt.address,
        borrower.address
      );
      expect(userReserveData.currentVariableDebt.toString()).to.be.bignumber.gt('0');
      const borrowedAmount = userReserveData.currentVariableDebt.toString();

      // prepare stable asset
      await mint('USDT', borrowedAmount.toString(), borrower, testEnv);
      await usdt.connect(borrower.signer).approve(pool.address, borrowedAmount);

      // repay
      await expect(
        pool
          .connect(borrower.signer)
          .repay(usdt.address, borrowedAmount, RateMode.Variable, borrower.address)
      ).to.not.be.reverted;

      // calculate borrowed amount
      const userReserveDataAfter = await getUserData(
        pool,
        helpersContract,
        usdt.address,
        borrower.address
      );
      expect(userReserveDataAfter.currentVariableDebt.toString()).to.be.bignumber.equal('0');

      const withdraAmount = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, LPAmount);
      await expect(
        convexFRAX3CRVVault
          .connect(borrower.signer)
          .withdrawCollateral(FRAX_3CRV_LP.address, withdraAmount, 9900, borrower.address)
      ).to.not.be.reverted;
    });
  });
  describe('liquidation:', async () => {
    it('Liquidates the USDC borrow', async () => {
      const { users, usdc, FRAX_3CRV_LP, pool, helpersContract, aCVXFRAX_3CRV, cvxfrax_3crv } =
        testEnv;
      const borrower = users[2];
      const liquidator = users[4];

      // check aToken balance for liquidator, borrower
      // await expect(aCVXFRAX_3CRV.balanceOf(liquidator.address)).to.be.bignumber.equal('0');
      const borrowerAtokenBalance = await aCVXFRAX_3CRV.balanceOf(borrower.address);
      expect(borrowerAtokenBalance).to.be.bignumber.gt('0');

      // check debt
      const userReserveDataBefore = await getUserData(
        pool,
        helpersContract,
        usdc.address,
        borrower.address
      );
      expect(userReserveDataBefore.currentVariableDebt.toString()).to.be.bignumber.gt('0');

      // drop liquidation threshold
      const configurator = await getLendingPoolConfiguratorProxy();
      await configurator.configureReserveAsCollateral(
        cvxfrax_3crv.address,
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
      mint('USDC', amountToLiquidate, liquidator, testEnv);
      await usdc.connect(liquidator.signer).approve(pool.address, amountToLiquidate);
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidationCall(
            FRAX_3CRV_LP.address,
            usdc.address,
            borrower.address,
            amountToLiquidate,
            false
          )
      ).to.not.be.reverted;

      const userReserveDataAfter = await getUserData(
        pool,
        helpersContract,
        usdc.address,
        borrower.address
      );

      expect(
        userReserveDataAfter.currentVariableDebt
          .multipliedBy(2)
          .minus(userReserveDataBefore.currentVariableDebt)
          .abs()
          .toString()
      ).to.be.bignumber.lt('10');
    });
  });
});

makeSuite('SUSD Leverage Swap', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const iterations = 3;
  let susdLevSwap = {} as GeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxdai_usdc_usdt_susd } = testEnv;
    susdLevSwap = await getCollateralLevSwapper(testEnv, cvxdai_usdc_usdt_susd.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxdai_usdc_usdt_susd.address)
    ).ltv.toString();
  });
  describe('configuration', () => {
    it('DAI, USDC, USDT should be available for borrowing.', async () => {
      const { dai, usdc, usdt } = testEnv;
      const coins = (await susdLevSwap.getAvailableStableCoins()).map((coin) => coin.toUpperCase());
      expect(coins.length).to.be.equal(3);
      expect(coins.includes(dai.address.toUpperCase())).to.be.equal(true);
      expect(coins.includes(usdc.address.toUpperCase())).to.be.equal(true);
      expect(coins.includes(usdt.address.toUpperCase())).to.be.equal(true);
    });
  });
  describe('enterPosition(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { dai } = testEnv;
      const principalAmount = 0;
      const stableCoin = dai.address;
      await expect(
        susdLevSwap.enterPosition(principalAmount, iterations, ltv, stableCoin)
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { aDai } = testEnv;
      const principalAmount = 10;
      const stableCoin = aDai.address;
      await expect(
        susdLevSwap.enterPosition(principalAmount, iterations, ltv, stableCoin)
      ).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, dai, DAI_USDC_USDT_SUSD_LP } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(
        DAI_USDC_USDT_SUSD_LP.address,
        '1000'
      );
      const stableCoin = dai.address;
      await expect(
        susdLevSwap
          .connect(borrower.signer)
          .enterPosition(principalAmount, iterations, ltv, stableCoin)
      ).to.be.revertedWith('115');
    });
  });
  describe('enterPosition():', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, DAI_USDC_USDT_SUSD_LP, pool, helpersContract } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(DAI_USDC_USDT_SUSD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          DAI_USDC_USDT_SUSD_LP.address,
          LPAmount,
          ltv,
          iterations,
          usdt.address
        )
      ).toString();

      // Deposit USDT to Lending Pool
      await mint('USDT', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(usdt, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('DAI_USDC_USDT_SUSD_LP', principalAmount, borrower, testEnv);
      await DAI_USDC_USDT_SUSD_LP.connect(borrower.signer).approve(
        susdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(susdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await susdLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, usdt.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
    it('USDC as borrowing asset', async () => {
      const { users, usdc, DAI_USDC_USDT_SUSD_LP, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(DAI_USDC_USDT_SUSD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          DAI_USDC_USDT_SUSD_LP.address,
          LPAmount,
          ltv,
          iterations,
          usdc.address
        )
      ).toString();
      // Depositor deposits USDT to Lending Pool
      await mint('USDC', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(usdc, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('DAI_USDC_USDT_SUSD_LP', principalAmount, borrower, testEnv);
      await DAI_USDC_USDT_SUSD_LP.connect(borrower.signer).approve(
        susdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(susdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await susdLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, usdc.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
    it('DAI as borrowing asset', async () => {
      const { users, dai, DAI_USDC_USDT_SUSD_LP, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(DAI_USDC_USDT_SUSD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          DAI_USDC_USDT_SUSD_LP.address,
          LPAmount,
          ltv,
          iterations,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('DAI_USDC_USDT_SUSD_LP', principalAmount, borrower, testEnv);
      await DAI_USDC_USDT_SUSD_LP.connect(borrower.signer).approve(
        susdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(susdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await susdLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, dai.address);

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
    it('USDT', async () => {
      const { users, usdt, DAI_USDC_USDT_SUSD_LP, pool, helpersContract } = testEnv;
      const borrower = users[1];

      let balance = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(balance).to.be.bignumber.equal('0');

      // calculate borrowed amount
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      const borrowedAmount = await varDebtToken.balanceOf(borrower.address);

      // prepare stable asset
      await mint('USDT', borrowedAmount.toString(), borrower, testEnv);
      await usdt.connect(borrower.signer).approve(pool.address, borrowedAmount);

      // repay
      await expect(
        pool
          .connect(borrower.signer)
          .repay(usdt.address, borrowedAmount, RateMode.Variable, borrower.address)
      ).to.not.be.reverted;
    });
  });
  describe('liquidation:', async () => {
    it('DAI', async () => {
      const {
        users,
        dai,
        DAI_USDC_USDT_SUSD_LP,
        pool,
        helpersContract,
        aCVXDAI_USDC_USDT_SUSD,
        cvxdai_usdc_usdt_susd,
      } = testEnv;
      const borrower = users[3];
      const liquidator = users[4];

      // check aToken balance for liquidator, borrower
      // await expect(aCVXFRAX_3CRV.balanceOf(liquidator.address)).to.be.bignumber.equal('0');
      const borrowerAtokenBalance = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      expect(borrowerAtokenBalance).to.be.bignumber.gt('0');

      // check debt
      const userReserveDataBefore = await getUserData(
        pool,
        helpersContract,
        dai.address,
        borrower.address
      );
      expect(userReserveDataBefore.currentVariableDebt.toString()).to.be.bignumber.gt('0');

      // drop liquidation threshold
      const configurator = await getLendingPoolConfiguratorProxy();
      await configurator.configureReserveAsCollateral(
        cvxdai_usdc_usdt_susd.address,
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
      mint('DAI', amountToLiquidate, liquidator, testEnv);
      await dai.connect(liquidator.signer).approve(pool.address, amountToLiquidate);
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidationCall(
            DAI_USDC_USDT_SUSD_LP.address,
            dai.address,
            borrower.address,
            amountToLiquidate,
            false
          )
      ).to.not.be.reverted;

      const userReserveDataAfter = await getUserData(
        pool,
        helpersContract,
        dai.address,
        borrower.address
      );

      expect(userReserveDataAfter.currentVariableDebt).to.be.bignumber.lt(
        userReserveDataBefore.currentVariableDebt.toFixed(0)
      );
    });
  });
});
