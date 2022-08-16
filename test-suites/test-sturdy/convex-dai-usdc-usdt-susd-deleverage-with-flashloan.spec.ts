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
  const { usdc, dai, usdt, DAI_USDC_USDT_SUSD_LP } = testEnv;
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

makeSuite('SUSD Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage2 = '100';
  const slippage1 = '200';
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
  describe('leavePosition - full amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, aCVXDAI_USDC_USDT_SUSD, DAI_USDC_USDT_SUSD_LP, pool, helpersContract } =
        testEnv;

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

      const beforeBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          principalAmount,
          slippage1,
          slippage2,
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      const afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
    });
    it('USDC as borrowing asset', async () => {
      const { users, usdc, DAI_USDC_USDT_SUSD_LP, aCVXDAI_USDC_USDT_SUSD, pool, helpersContract } =
        testEnv;
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
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
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

      const beforeBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          principalAmount,
          slippage1,
          slippage2,
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      const afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
    });
    it('DAI as borrowing asset', async () => {
      const { users, dai, DAI_USDC_USDT_SUSD_LP, aCVXDAI_USDC_USDT_SUSD, pool, helpersContract } =
        testEnv;
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
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
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

      const beforeBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          principalAmount,
          slippage1,
          slippage2,
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      const afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
    });
  });
});

makeSuite('SUSD Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage2 = '100';
  const slippage1 = '200';
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
  describe('leavePosition - partial amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, aCVXDAI_USDC_USDT_SUSD, DAI_USDC_USDT_SUSD_LP, pool, helpersContract } =
        testEnv;

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

      const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

      const beforeBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          (Number(principalAmount) / 10).toFixed(),
          slippage1,
          slippage2,
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          ((Number(principalAmount) / 10) * 2).toFixed(),
          slippage1,
          slippage2,
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          ((Number(principalAmount) / 10) * 3).toFixed(),
          slippage1,
          slippage2,
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          ((Number(principalAmount) / 10) * 4).toFixed(),
          slippage1,
          slippage2,
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
    it('USDC as borrowing asset', async () => {
      const { users, usdc, DAI_USDC_USDT_SUSD_LP, aCVXDAI_USDC_USDT_SUSD, pool, helpersContract } =
        testEnv;
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
      // Depositor deposits USDC to Lending Pool
      await mint('USDC', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(usdc, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('DAI_USDC_USDT_SUSD_LP', principalAmount, borrower, testEnv);
      await DAI_USDC_USDT_SUSD_LP.connect(borrower.signer).approve(
        susdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
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

      const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

      const beforeBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          (Number(principalAmount) / 10).toFixed(),
          slippage1,
          slippage2,
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          ((Number(principalAmount) / 10) * 2).toFixed(),
          slippage1,
          slippage2,
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          ((Number(principalAmount) / 10) * 3).toFixed(),
          slippage1,
          slippage2,
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          ((Number(principalAmount) / 10) * 4).toFixed(),
          slippage1,
          slippage2,
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
    it('DAI as borrowing asset', async () => {
      const { users, dai, DAI_USDC_USDT_SUSD_LP, aCVXDAI_USDC_USDT_SUSD, pool, helpersContract } =
        testEnv;
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
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
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

      const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

      const beforeBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          (Number(principalAmount) / 10).toFixed(),
          slippage1,
          slippage2,
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          ((Number(principalAmount) / 10) * 2).toFixed(),
          slippage1,
          slippage2,
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          ((Number(principalAmount) / 10) * 3).toFixed(),
          slippage1,
          slippage2,
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      await susdLevSwap
        .connect(borrower.signer)
        .leavePositionWithFlashloan(
          ((Number(principalAmount) / 10) * 4).toFixed(),
          slippage1,
          slippage2,
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
