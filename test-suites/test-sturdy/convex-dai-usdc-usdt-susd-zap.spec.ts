import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { mint } from './helpers/mint';
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import { MintableERC20 } from '../../types';
import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';
import { IGeneralLevSwapFactory } from '../../types/IGeneralLevSwapFactory';
import { IGeneralLevSwap } from '../../types/IGeneralLevSwap';

const chai = require('chai');
const { expect } = chai;

const getCollateralLevSwapper = async (testEnv: TestEnv, collateral: tEthereumAddress) => {
  const { levSwapManager, deployer } = testEnv;
  const levSwapAddress = await levSwapManager.getLevSwapper(collateral);
  return IGeneralLevSwapFactory.connect(levSwapAddress, deployer.signer);
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

const calcETHAmount = async (testEnv: TestEnv, asset: tEthereumAddress, amount: BigNumberish) => {
  const { oracle } = testEnv;
  const assetPrice = await oracle.getAssetPrice(asset);
  const ethAmount = new BigNumber(amount.toString()).multipliedBy(assetPrice.toString()).toFixed(0);

  return ethAmount;
};

makeSuite('SUSD Zap Deposit', (testEnv) => {
  const LPAmount = '1000';
  const slippage = 100;
  let susdLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const {
      helpersContract,
      cvxdai_usdc_usdt_susd,
      vaultWhitelist,
      convexDAIUSDCUSDTSUSDVault,
      users,
    } = testEnv;
    susdLevSwap = await getCollateralLevSwapper(testEnv, cvxdai_usdc_usdt_susd.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxdai_usdc_usdt_susd.address)
    ).ltv.toString();

    await vaultWhitelist.addAddressToWhitelistContract(
      convexDAIUSDCUSDTSUSDVault.address,
      susdLevSwap.address
    );
    await vaultWhitelist.addAddressToWhitelistUser(
      convexDAIUSDCUSDTSUSDVault.address,
      users[0].address
    );
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
  describe('zapDeposit(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { dai } = testEnv;
      const principalAmount = 0;
      const stableCoin = dai.address;
      await expect(
        susdLevSwap.zapDeposit(stableCoin, principalAmount, slippage)
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { aDai } = testEnv;
      const principalAmount = 10;
      const stableCoin = aDai.address;
      await expect(
        susdLevSwap.zapDeposit(stableCoin, principalAmount, slippage)
      ).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, dai } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(dai.address, '1000');
      const stableCoin = dai.address;
      await expect(
        susdLevSwap.connect(borrower.signer).zapDeposit(stableCoin, principalAmount, slippage)
      ).to.be.revertedWith('115');
    });
  });
  describe('zapDeposit():', async () => {
    it('zap into LP vault with USDT', async () => {
      const {
        users,
        usdt,
        cvxdai_usdc_usdt_susd,
        convexDAIUSDCUSDTSUSDVault,
        aCVXDAI_USDC_USDT_SUSD,
        vaultWhitelist,
      } = testEnv;

      const borrower = users[1];
      const principalAmount = (await convertToCurrencyDecimals(usdt.address, LPAmount)).toString();

      // Prepare Collateral
      await mint('USDT', principalAmount, borrower);
      await usdt.connect(borrower.signer).approve(susdLevSwap.address, principalAmount);

      // leverage
      await expect(
        susdLevSwap.connect(borrower.signer).zapDeposit(usdt.address, principalAmount, slippage)
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexDAIUSDCUSDTSUSDVault.address,
        borrower.address
      );
      await susdLevSwap
        .connect(borrower.signer)
        .zapDeposit(usdt.address, principalAmount, slippage);

      expect(await usdt.balanceOf(borrower.address)).to.be.equal(0);
      expect(await cvxdai_usdc_usdt_susd.balanceOf(convexDAIUSDCUSDTSUSDVault.address)).to.be.equal(
        0
      );
      expect(
        await aCVXDAI_USDC_USDT_SUSD.balanceOf(convexDAIUSDCUSDTSUSDVault.address)
      ).to.be.equal(0);
      const afterBalanceOfBorrower = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
    });
  });
});

makeSuite('SUSD Zap Leverage', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const iterations = 3;
  let susdLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const {
      helpersContract,
      cvxdai_usdc_usdt_susd,
      vaultWhitelist,
      convexDAIUSDCUSDTSUSDVault,
      users,
    } = testEnv;
    susdLevSwap = await getCollateralLevSwapper(testEnv, cvxdai_usdc_usdt_susd.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxdai_usdc_usdt_susd.address)
    ).ltv.toString();

    await vaultWhitelist.addAddressToWhitelistContract(
      convexDAIUSDCUSDTSUSDVault.address,
      susdLevSwap.address
    );
    await vaultWhitelist.addAddressToWhitelistUser(
      convexDAIUSDCUSDTSUSDVault.address,
      users[0].address
    );
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
  // describe('zapLeverage(): Prerequisite checker', () => {
  //   it('should be reverted if try to use zero amount', async () => {
  //     const { dai } = testEnv;
  //     const principalAmount = 0;
  //     const stableCoin = dai.address;
  //     await expect(
  //       susdLevSwap.zapLeverage(stableCoin, principalAmount, iterations, ltv, stableCoin)
  //     ).to.be.revertedWith('113');
  //   });
  //   it('should be reverted if try to use invalid stable coin', async () => {
  //     const { dai, aDai } = testEnv;
  //     const principalAmount = 10;
  //     const stableCoin = aDai.address;
  //     await expect(
  //       susdLevSwap.zapLeverage(stableCoin, principalAmount, iterations, ltv, dai.address)
  //     ).to.be.revertedWith('114');
  //     await expect(
  //       susdLevSwap.zapLeverage(dai.address, principalAmount, iterations, ltv, stableCoin)
  //     ).to.be.revertedWith('114');
  //   });
  //   it('should be reverted when collateral is not enough', async () => {
  //     const { users, dai, DAI_USDC_USDT_SUSD_LP } = testEnv;
  //     const borrower = users[1];
  //     const principalAmount = await convertToCurrencyDecimals(dai.address, '1000');
  //     const stableCoin = dai.address;
  //     await expect(
  //       susdLevSwap
  //         .connect(borrower.signer)
  //         .zapLeverage(stableCoin, principalAmount, iterations, ltv, stableCoin)
  //     ).to.be.revertedWith('115');
  //   });
  // });
  // describe('zapLeverage():', async () => {
  //   it('USDT', async () => {
  //     const { users, usdt, DAI_USDC_USDT_SUSD_LP, pool, helpersContract, aCVXDAI_USDC_USDT_SUSD } =
  //       testEnv;

  //     const depositor = users[0];
  //     const borrower = users[1];
  //     const principalAmount = (await convertToCurrencyDecimals(usdt.address, LPAmount)).toString();
  //     const amountToDelegate = (
  //       await calcTotalBorrowAmount(testEnv, usdt.address, LPAmount, ltv, iterations, usdt.address)
  //     ).toString();

  //     // Deposit USDT to Lending Pool
  //     await mint('USDT', amountToDelegate, depositor);
  //     await depositToLendingPool(usdt, depositor, amountToDelegate, testEnv);

  //     // Prepare Collateral
  //     await mint('USDT', principalAmount, borrower);
  //     await usdt.connect(borrower.signer).approve(susdLevSwap.address, principalAmount);

  //     // approve delegate borrow
  //     const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
  //       .variableDebtTokenAddress;
  //     const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
  //     await varDebtToken
  //       .connect(borrower.signer)
  //       .approveDelegation(susdLevSwap.address, amountToDelegate);

  //     const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
  //     expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
  //     expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

  //     // leverage
  //     await susdLevSwap
  //       .connect(borrower.signer)
  //       .zapLeverage(usdt.address, principalAmount, iterations, ltv, usdt.address);

  //     const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

  //     expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
  //     expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
  //     expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
  //       oneEther.toFixed(0),
  //       INVALID_HF
  //     );
  //     const afterBalanceOfBorrower = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
  //     expect(afterBalanceOfBorrower.toString()).to.be.bignumber.gte(principalAmount);
  //   });
  // });
});

makeSuite('SUSD Zap Leverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage = 200;

  /// LTV = 0.8, slippage = 0.02, Aave fee = 0.0009
  /// leverage / (1 + leverage) <= LTV / (1 + slippage) / (1 + Aave fee)
  /// leverage / (1 + leverage) <= 0.8 / 1.02 / 1.0009 = 0.7836084
  /// leverage <= 0.7836084 / (1 - 0.7836084) = 3.62125
  const leverage = 36000;
  let susdLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const {
      helpersContract,
      cvxdai_usdc_usdt_susd,
      vaultWhitelist,
      convexDAIUSDCUSDTSUSDVault,
      users,
    } = testEnv;
    susdLevSwap = await getCollateralLevSwapper(testEnv, cvxdai_usdc_usdt_susd.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxdai_usdc_usdt_susd.address)
    ).ltv.toString();

    await vaultWhitelist.addAddressToWhitelistContract(
      convexDAIUSDCUSDTSUSDVault.address,
      susdLevSwap.address
    );
    await vaultWhitelist.addAddressToWhitelistUser(
      convexDAIUSDCUSDTSUSDVault.address,
      users[0].address
    );
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
  describe('zapLeverageWithFlashloan(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { dai } = testEnv;
      const principalAmount = 0;
      const stableCoin = dai.address;
      await expect(
        susdLevSwap.zapLeverageWithFlashloan(
          stableCoin,
          principalAmount,
          leverage,
          slippage,
          stableCoin,
          0
        )
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { dai, aDai } = testEnv;
      const principalAmount = 10;
      const stableCoin = aDai.address;
      await expect(
        susdLevSwap.zapLeverageWithFlashloan(
          stableCoin,
          principalAmount,
          leverage,
          slippage,
          dai.address,
          0
        )
      ).to.be.revertedWith('114');
      await expect(
        susdLevSwap.zapLeverageWithFlashloan(
          dai.address,
          principalAmount,
          leverage,
          slippage,
          stableCoin,
          0
        )
      ).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, dai } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(dai.address, '1000');
      const stableCoin = dai.address;
      await expect(
        susdLevSwap
          .connect(borrower.signer)
          .zapLeverageWithFlashloan(dai.address, principalAmount, leverage, slippage, stableCoin, 0)
      ).to.be.revertedWith('115');
    });
  });
  describe('zapLeverageWithFlashloan():', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, pool, helpersContract, vaultWhitelist, convexDAIUSDCUSDTSUSDVault } =
        testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (await convertToCurrencyDecimals(usdt.address, LPAmount)).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(testEnv, usdt.address, LPAmount, ltv, leverage, usdt.address)
      ).toString();

      // Deposit USDT to Lending Pool
      await mint('USDT', amountToDelegate, depositor);
      await depositToLendingPool(usdt, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('USDT', principalAmount, borrower);
      await usdt.connect(borrower.signer).approve(susdLevSwap.address, principalAmount);

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
      await expect(
        susdLevSwap
          .connect(borrower.signer)
          .zapLeverageWithFlashloan(
            usdt.address,
            principalAmount,
            leverage,
            slippage,
            usdt.address,
            0
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexDAIUSDCUSDTSUSDVault.address,
        borrower.address
      );
      await susdLevSwap
        .connect(borrower.signer)
        .zapLeverageWithFlashloan(
          usdt.address,
          principalAmount,
          leverage,
          slippage,
          usdt.address,
          0
        );

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
      const collateralETHAmount = await calcETHAmount(testEnv, usdt.address, LPAmount);

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
});
