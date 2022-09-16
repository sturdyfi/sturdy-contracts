import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { oneEther, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import { GeneralLevSwapFactory, GeneralLevSwap, MintableERC20 } from '../../types';
import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';

const chai = require('chai');
const { expect } = chai;

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
  const { weth, ETH_STETH_LP } = testEnv;
  const ethers = (DRE as any).ethers;
  let ownerAddress;
  let token;

  if (reserveSymbol == 'WETH') {
    ownerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    token = weth;
  } else if (reserveSymbol == 'ETH_STETH_LP') {
    ownerAddress = '0x43378368D84D4bA00D1C8E97EC2E6016A82fC062';
    token = ETH_STETH_LP;
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

makeSuite('ETHSTETH Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '2';
  const slippage2 = '100';
  const slippage1 = '100';
  const iterations = 3;
  let ethstethLevSwap = {} as GeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxeth_steth } = testEnv;
    ethstethLevSwap = await getCollateralLevSwapper(testEnv, cvxeth_steth.address);
    ltv = (await helpersContract.getReserveConfigurationData(cvxeth_steth.address)).ltv.toString();
  });
  describe('leavePosition - full amount:', async () => {
    it('WETH as borrowing asset', async () => {
      const { users, weth, ETH_STETH_LP, aCVXETH_STETH, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(ETH_STETH_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          ETH_STETH_LP.address,
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
      await mint('ETH_STETH_LP', principalAmount, borrower, testEnv);
      await ETH_STETH_LP.connect(borrower.signer).approve(ethstethLevSwap.address, principalAmount);

      // approve delegate borrow
      const wethDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(weth.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(wethDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(ethstethLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await ethstethLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, weth.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await ETH_STETH_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXETH_STETH.balanceOf(borrower.address);
      await aCVXETH_STETH
        .connect(borrower.signer)
        .approve(ethstethLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await ethstethLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          slippage1,
          slippage2,
          weth.address,
          aCVXETH_STETH.address
        );

      const afterBalanceOfBorrower = await ETH_STETH_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
    });
  });
});

makeSuite('ETHSTETH Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '2';
  const slippage2 = '100';
  const slippage1 = '100';
  const iterations = 3;
  let ethstethLevSwap = {} as GeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxeth_steth } = testEnv;
    ethstethLevSwap = await getCollateralLevSwapper(testEnv, cvxeth_steth.address);
    ltv = (await helpersContract.getReserveConfigurationData(cvxeth_steth.address)).ltv.toString();
  });
  describe('leavePosition - partial amount:', async () => {
    it('WETH as borrowing asset', async () => {
      const { users, weth, ETH_STETH_LP, aCVXETH_STETH, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(ETH_STETH_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          ETH_STETH_LP.address,
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
      await mint('ETH_STETH_LP', principalAmount, borrower, testEnv);
      await ETH_STETH_LP.connect(borrower.signer).approve(ethstethLevSwap.address, principalAmount);

      // approve delegate borrow
      const wethDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(weth.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(wethDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(ethstethLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await ethstethLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, weth.address);

      const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

      const beforeBalanceOfBorrower = await ETH_STETH_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXETH_STETH.balanceOf(borrower.address);
      await aCVXETH_STETH
        .connect(borrower.signer)
        .approve(ethstethLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await ethstethLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          slippage1,
          slippage2,
          weth.address,
          aCVXETH_STETH.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await ETH_STETH_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div((Number(principalAmount) / 10).toFixed())
          .toString()
      ).to.be.bignumber.gte('99');
      expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
      console.log(
        'leavePosition 10% HealthFactor: ',
        userGlobalDataAfterLeave.healthFactor.toString()
      );

      //de-leverage 20% amount
      balanceInSturdy = await aCVXETH_STETH.balanceOf(borrower.address);
      await aCVXETH_STETH
        .connect(borrower.signer)
        .approve(ethstethLevSwap.address, balanceInSturdy.mul(2));

      await ethstethLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          slippage1,
          slippage2,
          weth.address,
          aCVXETH_STETH.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await ETH_STETH_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div(((Number(principalAmount) / 10) * 3).toFixed())
          .toString()
      ).to.be.bignumber.gte('99');
      expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
      console.log(
        'leavePosition 20% HealthFactor: ',
        userGlobalDataAfterLeave.healthFactor.toString()
      );

      //de-leverage 30% amount
      balanceInSturdy = await aCVXETH_STETH.balanceOf(borrower.address);
      await aCVXETH_STETH
        .connect(borrower.signer)
        .approve(ethstethLevSwap.address, balanceInSturdy.mul(2));

      await ethstethLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          slippage1,
          slippage2,
          weth.address,
          aCVXETH_STETH.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await ETH_STETH_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div(((Number(principalAmount) / 10) * 6).toFixed())
          .toString()
      ).to.be.bignumber.gte('99');
      expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
      console.log(
        'leavePosition 30% HealthFactor: ',
        userGlobalDataAfterLeave.healthFactor.toString()
      );

      //de-leverage 40% amount
      balanceInSturdy = await aCVXETH_STETH.balanceOf(borrower.address);
      await aCVXETH_STETH
        .connect(borrower.signer)
        .approve(ethstethLevSwap.address, balanceInSturdy.mul(2));

      await ethstethLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          slippage1,
          slippage2,
          weth.address,
          aCVXETH_STETH.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await ETH_STETH_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
      expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
      console.log(
        'leavePosition 40% HealthFactor: ',
        userGlobalDataAfterLeave.healthFactor.toString()
      );
    });
  });
});
