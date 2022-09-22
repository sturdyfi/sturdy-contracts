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

const calcCollateralAmountFromEth = async (
  testEnv: TestEnv,
  collateral: tEthereumAddress,
  ethAmount: BigNumberish
) => {
  const { oracle } = testEnv;
  const collateralPrice = await oracle.getAssetPrice(collateral);

  const amount = await convertToCurrencyDecimals(
    collateral,
    new BigNumber(ethAmount.toString()).div(collateralPrice.toString()).toFixed(0)
  );

  return amount;
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

makeSuite('WSTETHWETH Deleverage without Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const slippage = '100';
  const LPAmount = '2';
  const iterations = 3;
  let wstethwethLevSwap = {} as GeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, aurawsteth_weth } = testEnv;
    wstethwethLevSwap = await getCollateralLevSwapper(testEnv, aurawsteth_weth.address);
    ltv = (await helpersContract.getReserveConfigurationData(aurawsteth_weth.address)).ltv.toString();
  });
  describe('leavePosition(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { weth, aAURAWSTETH_WETH } = testEnv;
      const principalAmount = 0;
      await expect(
        wstethwethLevSwap.leavePosition(
          principalAmount,
          slippage,
          iterations,
          weth.address,
          aAURAWSTETH_WETH.address
        )
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { aWeth, aAURAWSTETH_WETH } = testEnv;
      const principalAmount = 10;
      await expect(
        wstethwethLevSwap.leavePosition(
          principalAmount,
          slippage,
          iterations,
          aWeth.address,
          aAURAWSTETH_WETH.address
        )
      ).to.be.revertedWith('114');
    });
    it('should be reverted if try to use zero address as a aToken', async () => {
      const { weth } = testEnv;
      const principalAmount = 10;
      await expect(
        wstethwethLevSwap.leavePosition(
          principalAmount,
          slippage,
          iterations,
          weth.address,
          ZERO_ADDRESS
        )
      ).to.be.revertedWith('112');
    });
  });
  describe('leavePosition() - full amount:', async () => {
    it('WETH as borrowing asset', async () => {
      const { users, weth, BAL_WSTETH_WETH_LP, aAURAWSTETH_WETH, pool, helpersContract } = testEnv;
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

      const beforeBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      await aAURAWSTETH_WETH
        .connect(borrower.signer)
        .approve(wstethwethLevSwap.address, balanceInSturdy.mul(2));

      await wstethwethLevSwap
        .connect(borrower.signer)
        .leavePosition(principalAmount, '100', '10', weth.address, aAURAWSTETH_WETH.address);

      const afterBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
    });
  });
});

makeSuite('WSTETHWETH Deleverage without Flashloan', (testEnv) => {
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
  describe('leavePosition() - partial amount:', async () => {
    it('WETH as borrowing asset', async () => {
      const { users, weth, aAURAWSTETH_WETH, BAL_WSTETH_WETH_LP, pool, helpersContract } = testEnv;

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

      const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
      console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

      const beforeBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      await aAURAWSTETH_WETH
        .connect(borrower.signer)
        .approve(wstethwethLevSwap.address, balanceInSturdy.mul(2));

      await wstethwethLevSwap
        .connect(borrower.signer)
        .leavePosition(
          (Number(principalAmount) / 10).toFixed(),
          '100',
          '10',
          weth.address,
          aAURAWSTETH_WETH.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      await aAURAWSTETH_WETH
        .connect(borrower.signer)
        .approve(wstethwethLevSwap.address, balanceInSturdy.mul(2));

      await wstethwethLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 2).toFixed(),
          '100',
          '10',
          weth.address,
          aAURAWSTETH_WETH.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      await aAURAWSTETH_WETH
        .connect(borrower.signer)
        .approve(wstethwethLevSwap.address, balanceInSturdy.mul(2));

      await wstethwethLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 3).toFixed(),
          '100',
          '10',
          weth.address,
          aAURAWSTETH_WETH.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      await aAURAWSTETH_WETH
        .connect(borrower.signer)
        .approve(wstethwethLevSwap.address, balanceInSturdy.mul(2));

      await wstethwethLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 4).toFixed(),
          '100',
          '10',
          weth.address,
          aAURAWSTETH_WETH.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
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

makeSuite('WSTETHWETH Deleverage without Flashloan', (testEnv) => {
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
  describe('leavePosition() - increase healthFactor:', async () => {
    it('WETH as borrowing asset', async () => {
      const { users, weth, aAURAWSTETH_WETH, BAL_WSTETH_WETH_LP, pool, helpersContract } = testEnv;

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

      const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
      console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

      const collateralAmountFromDebt = (
        await calcCollateralAmountFromEth(
          testEnv,
          BAL_WSTETH_WETH_LP.address,
          userGlobalDataAfterEnter.totalDebtETH
        )
      ).toString();
      const beforeBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% debt amount
      let balanceInSturdy = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      await aAURAWSTETH_WETH
        .connect(borrower.signer)
        .approve(wstethwethLevSwap.address, balanceInSturdy.mul(2));

      await wstethwethLevSwap
        .connect(borrower.signer)
        .leavePosition(
          (Number(collateralAmountFromDebt) / 10).toFixed(),
          '100',
          '0',
          weth.address,
          aAURAWSTETH_WETH.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
      expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
      console.log(
        'leavePosition 10% HealthFactor: ',
        userGlobalDataAfterLeave.healthFactor.toString()
      );

      //de-leverage 20% debt amount
      balanceInSturdy = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      await aAURAWSTETH_WETH
        .connect(borrower.signer)
        .approve(wstethwethLevSwap.address, balanceInSturdy.mul(2));

      await wstethwethLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 2).toFixed(),
          '100',
          '0',
          weth.address,
          aAURAWSTETH_WETH.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
      expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
      console.log(
        'leavePosition 20% HealthFactor: ',
        userGlobalDataAfterLeave.healthFactor.toString()
      );

      //de-leverage 30% debt amount
      balanceInSturdy = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      await aAURAWSTETH_WETH
        .connect(borrower.signer)
        .approve(wstethwethLevSwap.address, balanceInSturdy.mul(2));

      await wstethwethLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 3).toFixed(),
          '100',
          '0',
          weth.address,
          aAURAWSTETH_WETH.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
      expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
      console.log(
        'leavePosition 30% HealthFactor: ',
        userGlobalDataAfterLeave.healthFactor.toString()
      );

      //de-leverage 40% debt amount
      balanceInSturdy = await aAURAWSTETH_WETH.balanceOf(borrower.address);
      await aAURAWSTETH_WETH
        .connect(borrower.signer)
        .approve(wstethwethLevSwap.address, balanceInSturdy.mul(2));

      await wstethwethLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 4).toFixed(),
          '100',
          '0',
          weth.address,
          aAURAWSTETH_WETH.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_WSTETH_WETH_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.toString()).to.be.bignumber.eq('0');
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
