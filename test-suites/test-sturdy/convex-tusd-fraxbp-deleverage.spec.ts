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
  const { usdc, dai, usdt, TUSD_FRAXBP_LP } = testEnv;
  const ethers = (DRE as any).ethers;
  let ownerAddress;
  let token;

  if (reserveSymbol == 'USDC') {
    ownerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    token = usdc;
  } else if (reserveSymbol == 'DAI') {
    ownerAddress = '0x4967ec98748efb98490663a65b16698069a1eb35';
    token = dai;
  } else if (reserveSymbol == 'USDT') {
    ownerAddress = '0x5754284f345afc66a98fbB0a0Afe71e0F007B949';
    token = usdt;
  } else if (reserveSymbol == 'TUSD_FRAXBP_LP') {
    ownerAddress = '0x5180db0237291A6449DdA9ed33aD90a38787621c';
    token = TUSD_FRAXBP_LP;
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

makeSuite('TUSD_FRAXBP Deleverage without Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const slippage = '100';
  const LPAmount = '1000';
  const iterations = 3;
  let tusdfraxbpLevSwap = {} as GeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxtusd_fraxbp, vaultWhitelist, convexTUSDFRAXBPVault, users } =
      testEnv;
    tusdfraxbpLevSwap = await getCollateralLevSwapper(testEnv, cvxtusd_fraxbp.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxtusd_fraxbp.address)
    ).ltv.toString();

    await vaultWhitelist.addAddressToWhitelistContract(
      convexTUSDFRAXBPVault.address,
      tusdfraxbpLevSwap.address
    );
    await vaultWhitelist.addAddressToWhitelistUser(convexTUSDFRAXBPVault.address, users[0].address);
  });
  describe('leavePosition(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { dai, aCVXTUSD_FRAXBP } = testEnv;
      const principalAmount = 0;
      await expect(
        tusdfraxbpLevSwap.leavePosition(
          principalAmount,
          slippage,
          iterations,
          dai.address,
          aCVXTUSD_FRAXBP.address
        )
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { aDai, aCVXTUSD_FRAXBP } = testEnv;
      const principalAmount = 10;
      await expect(
        tusdfraxbpLevSwap.leavePosition(
          principalAmount,
          slippage,
          iterations,
          aDai.address,
          aCVXTUSD_FRAXBP.address
        )
      ).to.be.revertedWith('114');
    });
    it('should be reverted if try to use zero address as a aToken', async () => {
      const { dai } = testEnv;
      const principalAmount = 10;
      await expect(
        tusdfraxbpLevSwap.leavePosition(
          principalAmount,
          slippage,
          iterations,
          dai.address,
          ZERO_ADDRESS
        )
      ).to.be.revertedWith('112');
    });
  });
  describe('leavePosition() - full amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        aCVXTUSD_FRAXBP,
        TUSD_FRAXBP_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexTUSDFRAXBPVault,
      } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          TUSD_FRAXBP_LP.address,
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
      await mint('TUSD_FRAXBP_LP', principalAmount, borrower, testEnv);
      await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
        tusdfraxbpLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(tusdfraxbpLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .enterPosition(principalAmount, iterations, ltv, usdt.address)
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, usdt.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await vaultWhitelist.removeAddressFromWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .leavePosition(principalAmount, '100', '10', usdt.address, aCVXTUSD_FRAXBP.address)
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(principalAmount, '100', '10', usdt.address, aCVXTUSD_FRAXBP.address);

      const afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
    });
    it('USDC as borrowing asset', async () => {
      const {
        users,
        usdc,
        TUSD_FRAXBP_LP,
        aCVXTUSD_FRAXBP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexTUSDFRAXBPVault,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          TUSD_FRAXBP_LP.address,
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
      await mint('TUSD_FRAXBP_LP', principalAmount, borrower, testEnv);
      await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
        tusdfraxbpLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(tusdfraxbpLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .enterPosition(principalAmount, iterations, ltv, usdc.address)
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, usdc.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await vaultWhitelist.removeAddressFromWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .leavePosition(principalAmount, '100', '10', usdc.address, aCVXTUSD_FRAXBP.address)
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(principalAmount, '100', '10', usdc.address, aCVXTUSD_FRAXBP.address);

      const afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
    });
    it('DAI as borrowing asset', async () => {
      const {
        users,
        dai,
        TUSD_FRAXBP_LP,
        aCVXTUSD_FRAXBP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexTUSDFRAXBPVault,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          TUSD_FRAXBP_LP.address,
          LPAmount,
          ltv,
          iterations,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('TUSD_FRAXBP_LP', principalAmount, borrower, testEnv);
      await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
        tusdfraxbpLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(tusdfraxbpLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .enterPosition(principalAmount, iterations, ltv, dai.address)
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPosition(principalAmount, iterations, ltv, dai.address);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await vaultWhitelist.removeAddressFromWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .leavePosition(principalAmount, '100', '10', dai.address, aCVXTUSD_FRAXBP.address)
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(principalAmount, '100', '10', dai.address, aCVXTUSD_FRAXBP.address);

      const afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '99'
      );
    });
  });
});

makeSuite('TUSD_FRAXBP Deleverage without Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage = '100';
  const iterations = 3;
  let tusdfraxbpLevSwap = {} as GeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxtusd_fraxbp, vaultWhitelist, convexTUSDFRAXBPVault } = testEnv;
    tusdfraxbpLevSwap = await getCollateralLevSwapper(testEnv, cvxtusd_fraxbp.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxtusd_fraxbp.address)
    ).ltv.toString();

    await vaultWhitelist.addAddressToWhitelistContract(
      convexTUSDFRAXBPVault.address,
      tusdfraxbpLevSwap.address
    );
  });
  describe('leavePosition() - partial amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, aUsdt, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP, pool, helpersContract } =
        testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          TUSD_FRAXBP_LP.address,
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
      await mint('TUSD_FRAXBP_LP', principalAmount, borrower, testEnv);
      await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
        tusdfraxbpLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(tusdfraxbpLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await tusdfraxbpLevSwap
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

      const beforeBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          (Number(principalAmount) / 10).toFixed(),
          '100',
          '10',
          usdt.address,
          aCVXTUSD_FRAXBP.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 2).toFixed(),
          '100',
          '10',
          usdt.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 3).toFixed(),
          '100',
          '10',
          usdt.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 4).toFixed(),
          '100',
          '10',
          usdt.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      const { users, usdc, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP, pool, helpersContract } = testEnv;

      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          TUSD_FRAXBP_LP.address,
          LPAmount,
          ltv,
          iterations,
          usdc.address
        )
      ).toString();

      // Deposit USDC to Lending Pool
      await mint('USDC', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(usdc, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('TUSD_FRAXBP_LP', principalAmount, borrower, testEnv);
      await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
        tusdfraxbpLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(tusdfraxbpLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await tusdfraxbpLevSwap
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

      const beforeBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          (Number(principalAmount) / 10).toFixed(),
          '100',
          '10',
          usdc.address,
          aCVXTUSD_FRAXBP.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 2).toFixed(),
          '100',
          '10',
          usdc.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 3).toFixed(),
          '100',
          '10',
          usdc.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 4).toFixed(),
          '100',
          '10',
          usdc.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      const { users, dai, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP, pool, helpersContract } = testEnv;

      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          TUSD_FRAXBP_LP.address,
          LPAmount,
          ltv,
          iterations,
          dai.address
        )
      ).toString();

      // Deposit DAI to Lending Pool
      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('TUSD_FRAXBP_LP', principalAmount, borrower, testEnv);
      await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
        tusdfraxbpLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(tusdfraxbpLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await tusdfraxbpLevSwap
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

      const beforeBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          (Number(principalAmount) / 10).toFixed(),
          '100',
          '10',
          dai.address,
          aCVXTUSD_FRAXBP.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 2).toFixed(),
          '100',
          '10',
          dai.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 3).toFixed(),
          '100',
          '10',
          dai.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(principalAmount) / 10) * 4).toFixed(),
          '100',
          '10',
          dai.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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

makeSuite('TUSD_FRAXBP Deleverage without Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage = '100';
  const iterations = 3;
  let tusdfraxbpLevSwap = {} as GeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxtusd_fraxbp, vaultWhitelist, convexTUSDFRAXBPVault } = testEnv;
    tusdfraxbpLevSwap = await getCollateralLevSwapper(testEnv, cvxtusd_fraxbp.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxtusd_fraxbp.address)
    ).ltv.toString();

    await vaultWhitelist.addAddressToWhitelistContract(
      convexTUSDFRAXBPVault.address,
      tusdfraxbpLevSwap.address
    );
  });
  describe('leavePosition() - increase healthFactor:', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, aUsdt, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP, pool, helpersContract } =
        testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          TUSD_FRAXBP_LP.address,
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
      await mint('TUSD_FRAXBP_LP', principalAmount, borrower, testEnv);
      await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
        tusdfraxbpLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(tusdfraxbpLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await tusdfraxbpLevSwap
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

      const collateralAmountFromDebt = (
        await calcCollateralAmountFromEth(
          testEnv,
          TUSD_FRAXBP_LP.address,
          userGlobalDataAfterEnter.totalDebtETH
        )
      ).toString();
      const beforeBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% debt amount
      let balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          (Number(collateralAmountFromDebt) / 10).toFixed(),
          '100',
          '0',
          usdt.address,
          aCVXTUSD_FRAXBP.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 2).toFixed(),
          '100',
          '0',
          usdt.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 3).toFixed(),
          '100',
          '0',
          usdt.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 4).toFixed(),
          '100',
          '0',
          usdt.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
    it('USDC as borrowing asset', async () => {
      const { users, usdc, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP, pool, helpersContract } = testEnv;

      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          TUSD_FRAXBP_LP.address,
          LPAmount,
          ltv,
          iterations,
          usdc.address
        )
      ).toString();

      // Deposit USDC to Lending Pool
      await mint('USDC', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(usdc, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('TUSD_FRAXBP_LP', principalAmount, borrower, testEnv);
      await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
        tusdfraxbpLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(tusdfraxbpLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await tusdfraxbpLevSwap
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

      const collateralAmountFromDebt = (
        await calcCollateralAmountFromEth(
          testEnv,
          TUSD_FRAXBP_LP.address,
          userGlobalDataAfterEnter.totalDebtETH
        )
      ).toString();
      const beforeBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% debt amount
      let balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          (Number(collateralAmountFromDebt) / 10).toFixed(),
          '100',
          '0',
          usdc.address,
          aCVXTUSD_FRAXBP.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 2).toFixed(),
          '100',
          '0',
          usdc.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 3).toFixed(),
          '100',
          '0',
          usdc.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 4).toFixed(),
          '100',
          '0',
          usdc.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
    it('DAI as borrowing asset', async () => {
      const { users, dai, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP, pool, helpersContract } = testEnv;

      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          TUSD_FRAXBP_LP.address,
          LPAmount,
          ltv,
          iterations,
          dai.address
        )
      ).toString();

      // Deposit DAI to Lending Pool
      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('TUSD_FRAXBP_LP', principalAmount, borrower, testEnv);
      await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
        tusdfraxbpLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(tusdfraxbpLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await tusdfraxbpLevSwap
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

      const collateralAmountFromDebt = (
        await calcCollateralAmountFromEth(
          testEnv,
          TUSD_FRAXBP_LP.address,
          userGlobalDataAfterEnter.totalDebtETH
        )
      ).toString();
      const beforeBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% debt amount
      let balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          (Number(collateralAmountFromDebt) / 10).toFixed(),
          '100',
          '0',
          dai.address,
          aCVXTUSD_FRAXBP.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 2).toFixed(),
          '100',
          '0',
          dai.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 3).toFixed(),
          '100',
          '0',
          dai.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      await aCVXTUSD_FRAXBP
        .connect(borrower.signer)
        .approve(tusdfraxbpLevSwap.address, balanceInSturdy.mul(2));

      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .leavePosition(
          ((Number(collateralAmountFromDebt) / 10) * 4).toFixed(),
          '100',
          '0',
          dai.address,
          aCVXTUSD_FRAXBP.address
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
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
