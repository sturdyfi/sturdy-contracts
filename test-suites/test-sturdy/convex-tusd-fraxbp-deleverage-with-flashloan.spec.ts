import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { oneEther, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import { MintableERC20 } from '../../types';
import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';
import { IGeneralLevSwap__factory } from '../../types';
import { IGeneralLevSwap } from '../../types';

const chai = require('chai');
const { expect } = chai;

const getCollateralLevSwapper = async (testEnv: TestEnv, collateral: tEthereumAddress) => {
  const { levSwapManager, deployer } = testEnv;
  const levSwapAddress = await levSwapManager.getLevSwapper(collateral);
  return IGeneralLevSwap__factory.connect(levSwapAddress, deployer.signer);
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
    ownerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
    token = usdc;
  } else if (reserveSymbol == 'DAI') {
    ownerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
    token = dai;
  } else if (reserveSymbol == 'USDT') {
    ownerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
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

makeSuite('TUSDFRAXBP Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage2 = '100';
  const leverage = 36000;
  let tusdfraxbpLevSwap = {} as IGeneralLevSwap;
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
  describe('leavePosition - full amount:', async () => {
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
          leverage,
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
          .enterPositionWithFlashloan(principalAmount, leverage, slippage2, usdt.address, 0)
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, slippage2, usdt.address, 0);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await vaultWhitelist.removeAddressFromWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            slippage2,
            usdt.address,
            aCVXTUSD_FRAXBP.address,
            0
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          slippage2,
          usdt.address,
          aCVXTUSD_FRAXBP.address,
          0
        );

      const afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
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
          leverage,
          usdc.address
        )
      ).toString();
      // Depositor deposits USDT to Lending Pool
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
          .enterPositionWithFlashloan(principalAmount, leverage, slippage2, usdc.address, 0)
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, slippage2, usdc.address, 0);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await vaultWhitelist.removeAddressFromWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            slippage2,
            usdc.address,
            aCVXTUSD_FRAXBP.address,
            0
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          slippage2,
          usdc.address,
          aCVXTUSD_FRAXBP.address,
          0
        );

      const afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
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
          leverage,
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
          .enterPositionWithFlashloan(principalAmount, leverage, slippage2, dai.address, 0)
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, slippage2, dai.address, 0);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await vaultWhitelist.removeAddressFromWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            slippage2,
            dai.address,
            aCVXTUSD_FRAXBP.address,
            0
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist.addAddressToWhitelistUser(
        convexTUSDFRAXBPVault.address,
        borrower.address
      );
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          slippage2,
          dai.address,
          aCVXTUSD_FRAXBP.address,
          0
        );

      const afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
      );
    });
  });
});

makeSuite('TUSDFRAXBP Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage2 = '100';
  const leverage = 36000;
  let tusdfraxbpLevSwap = {} as IGeneralLevSwap;
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
  describe('leavePosition - partial amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP, pool, helpersContract } = testEnv;

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
          leverage,
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
        .enterPositionWithFlashloan(principalAmount, leverage, slippage2, usdt.address, 0);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          slippage2,
          usdt.address,
          aCVXTUSD_FRAXBP.address,
          0
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
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          slippage2,
          usdt.address,
          aCVXTUSD_FRAXBP.address,
          0
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
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          slippage2,
          usdt.address,
          aCVXTUSD_FRAXBP.address,
          0
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
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          slippage2,
          usdt.address,
          aCVXTUSD_FRAXBP.address,
          0
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
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
      const { users, usdc, TUSD_FRAXBP_LP, aCVXTUSD_FRAXBP, pool, helpersContract } = testEnv;
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
          leverage,
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
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, slippage2, usdc.address, 0);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          slippage2,
          usdc.address,
          aCVXTUSD_FRAXBP.address,
          0
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
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          slippage2,
          usdc.address,
          aCVXTUSD_FRAXBP.address,
          0
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
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          slippage2,
          usdc.address,
          aCVXTUSD_FRAXBP.address,
          0
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
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          slippage2,
          usdc.address,
          aCVXTUSD_FRAXBP.address,
          0
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
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
      const { users, dai, TUSD_FRAXBP_LP, aCVXTUSD_FRAXBP, pool, helpersContract } = testEnv;
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
          leverage,
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
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, slippage2, dai.address, 0);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          slippage2,
          dai.address,
          aCVXTUSD_FRAXBP.address,
          0
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
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          slippage2,
          dai.address,
          aCVXTUSD_FRAXBP.address,
          0
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
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          slippage2,
          dai.address,
          aCVXTUSD_FRAXBP.address,
          0
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
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          slippage2,
          dai.address,
          aCVXTUSD_FRAXBP.address,
          0
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
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
