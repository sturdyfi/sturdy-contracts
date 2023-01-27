import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { mint } from './helpers/mint';
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import { GeneralLevSwap__factory, GeneralLevSwap, MintableERC20 } from '../../types';
import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';

const chai = require('chai');
const { expect } = chai;

const getCollateralLevSwapper = async (testEnv: TestEnv, collateral: tEthereumAddress) => {
  const { levSwapManager, deployer } = testEnv;
  const levSwapAddress = await levSwapManager.getLevSwapper(collateral);
  return GeneralLevSwap__factory.connect(levSwapAddress, deployer.signer);
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

makeSuite('WSTETHWETH Zap Deposit', (testEnv) => {
  const LPAmount = '2';
  const slippage = 100;
  let wstethwethLevSwap = {} as GeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, aurawsteth_weth } =
      testEnv;
    wstethwethLevSwap = await getCollateralLevSwapper(testEnv, aurawsteth_weth.address);
    ltv = (await helpersContract.getReserveConfigurationData(aurawsteth_weth.address)).ltv.toString();
  });
  describe('configuration', () => {
    it('WETH should be available for borrowing.', async () => {
      const { weth } = testEnv;
      const coins = (await wstethwethLevSwap.getAvailableBorrowingAssets()).map((coin) => coin.toUpperCase());
      expect(coins.length).to.be.equal(1);
      expect(coins.includes(weth.address.toUpperCase())).to.be.equal(true);
    });
  });
  describe('zapDeposit(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { weth } = testEnv;
      const principalAmount = 0;
      const stableCoin = weth.address;
      await expect(wstethwethLevSwap.zapDeposit(stableCoin, principalAmount, slippage)).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { aWeth } = testEnv;
      const principalAmount = 10;
      const stableCoin = aWeth.address;
      await expect(wstethwethLevSwap.zapDeposit(stableCoin, principalAmount, slippage)).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, weth } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(weth.address, '1000');
      const stableCoin = weth.address;
      await expect(
        wstethwethLevSwap.connect(borrower.signer).zapDeposit(stableCoin, principalAmount, slippage)
      ).to.be.revertedWith('115');
    });
  });
  describe('zapDeposit():', async () => {
    it('zap into LP vault with WETH', async () => {
      const {
        users,
        weth,
        aurawsteth_weth,
        auraWSTETHWETHVault,
        aAURAWSTETH_WETH,
      } = testEnv;

      const borrower = users[1];
      const principalAmount = (await convertToCurrencyDecimals(weth.address, LPAmount)).toString();

      // Prepare Collateral
      await mint('WETH', principalAmount, borrower);
      await weth.connect(borrower.signer).approve(wstethwethLevSwap.address, principalAmount);

      // zap deposit
      await wstethwethLevSwap.connect(borrower.signer).zapDeposit(weth.address, principalAmount, slippage);

      expect(await weth.balanceOf(borrower.address)).to.be.equal(0);
      expect(await aurawsteth_weth.balanceOf(auraWSTETHWETHVault.address)).to.be.equal(
        0
      );
      expect(
        await aAURAWSTETH_WETH.balanceOf(auraWSTETHWETHVault.address)
      ).to.be.equal(0);
      const afterBalanceOfBorrower = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
    });
  });
});

makeSuite('WSTETHWETH Zap Leverage with Flashloan', (testEnv) => {
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
    const { helpersContract, aurawsteth_weth } =
      testEnv;
    wstethwethLevSwap = await getCollateralLevSwapper(testEnv, aurawsteth_weth.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(aurawsteth_weth.address)
    ).ltv.toString();
  });
  describe('zapLeverageWithFlashloan(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { weth } = testEnv;
      const principalAmount = 0;
      const stableCoin = weth.address;
      await expect(
        wstethwethLevSwap.zapLeverageWithFlashloan(
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
      const { weth, aWeth } = testEnv;
      const principalAmount = 10;
      const stableCoin = aWeth.address;
      await expect(
        wstethwethLevSwap.zapLeverageWithFlashloan(
          stableCoin,
          principalAmount,
          leverage,
          slippage,
          weth.address,
          0
        )
      ).to.be.revertedWith('114');
      await expect(
        wstethwethLevSwap.zapLeverageWithFlashloan(
          weth.address,
          principalAmount,
          leverage,
          slippage,
          stableCoin,
          0
        )
      ).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, weth } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(weth.address, '1000');
      const stableCoin = weth.address;
      await expect(
        wstethwethLevSwap
          .connect(borrower.signer)
          .zapLeverageWithFlashloan(weth.address, principalAmount, leverage, slippage, stableCoin, 0)
      ).to.be.revertedWith('115');
    });
  });
  describe('zapLeverageWithFlashloan():', async () => {
    it('WETH as borrowing asset', async () => {
      const { users, weth, pool, helpersContract } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (await convertToCurrencyDecimals(weth.address, LPAmount)).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(testEnv, weth.address, LPAmount, ltv, leverage, weth.address)
      ).toString();

      // Deposit WETH to Lending Pool
      await mint('WETH', amountToDelegate, depositor);
      await depositToLendingPool(weth, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('WETH', principalAmount, borrower);
      await weth.connect(borrower.signer).approve(wstethwethLevSwap.address, principalAmount);

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
        .zapLeverageWithFlashloan(
          weth.address,
          principalAmount,
          leverage,
          slippage,
          weth.address,
          0
        );

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
      const collateralETHAmount = await calcETHAmount(testEnv, weth.address, LPAmount);

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
