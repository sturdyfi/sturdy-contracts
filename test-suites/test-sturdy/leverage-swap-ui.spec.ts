import BigNumber from 'bignumber.js';
import { ethers, BigNumberish, constants } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx, increaseTime } from '../../helpers/misc-utils';
import { APPROVAL_AMOUNT_LENDING_POOL, oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals, convertToCurrencyUnits } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { printUserAccountData, printDivider } from './helpers/utils/helpers';
import {
  getVariableDebtToken,
  getLendingPoolConfiguratorProxy,
  getMintableERC20,
} from '../../helpers/contracts-getters';
import type { ICurveExchange } from '../../types/ICurveExchange';
import { IERC20DetailedFactory } from '../../types/IERC20DetailedFactory';
import { GeneralLevSwapFactory, GeneralLevSwap, MintableERC20 } from '../../types';
import { ProtocolErrors, RateMode, tEthereumAddress } from '../../helpers/types';
import { getReserveData, getUserData } from './helpers/utils/helpers';
import { calcExpectedMaxWithdrawalAmount } from './helpers/utils/calculations';

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
  const {
    usdc,
    dai,
    usdt,
    FRAX_3CRV_LP,
    DAI_USDC_USDT_SUSD_LP,
    FRAX_USDC_LP,
    IRON_BANK_LP,
    MIM_3CRV_LP,
  } = testEnv;
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
    ownerAddress = '0x8cfa246f3539fb3843cad78819a24f03bbd4b991';
    token = FRAX_3CRV_LP;
  } else if (reserveSymbol == 'DAI_USDC_USDT_SUSD_LP') {
    ownerAddress = '0x1f9bB27d0C66fEB932f3F8B02620A128d072f3d8';
    token = DAI_USDC_USDT_SUSD_LP;
  } else if (reserveSymbol == 'FRAX_USDC_LP') {
    ownerAddress = '0x3732fe38e7497da670bd0633d565a5d80d3565e2';
    token = FRAX_USDC_LP;
  } else if (reserveSymbol == 'IRON_BANK_LP') {
    ownerAddress = '0xd4dfbde97c93e56d1e41325bb428c18299db203f';
    token = IRON_BANK_LP;
  } else if (reserveSymbol == 'MIM_3CRV_LP') {
    ownerAddress = '0xe896e539e557BC751860a7763C8dD589aF1698Ce';
    token = MIM_3CRV_LP;
  }

  await impersonateAccountsHardhat([ownerAddress]);
  const signer = await ethers.provider.getSigner(ownerAddress);
  await waitForTx(await token.connect(signer).transfer(user.address, amount));
};

const calcETHAmount = async (testEnv: TestEnv, asset: tEthereumAddress, amount: BigNumberish) => {
  const { oracle } = testEnv;
  const assetPrice = await oracle.getAssetPrice(asset);
  const ethAmount = new BigNumber(amount.toString()).multipliedBy(assetPrice.toString()).toFixed(0);

  return ethAmount;
};

const calcMaxWithdrawalAmount = async (
  testEnv: TestEnv,
  user: SignerWithAddress,
  collateral: tEthereumAddress,
  repayAsset: tEthereumAddress
) => {
  const { oracle, helpersContract, pool } = testEnv;

  const userGlobalDataBefore = await pool.getUserAccountData(user.address);

  const { liquidationThreshold } = await helpersContract.getReserveConfigurationData(collateral);
  const { aTokenAddress } = await pool.getReserveData(collateral);

  const collateralToken = await getMintableERC20(aTokenAddress);
  const balanceInSturdy = await collateralToken.balanceOf(user.address);
  const collaterPrice = await oracle.getAssetPrice(collateral);
  const collateralDecimals = await collateralToken.decimals();
  const balanceInETH = new BigNumber(collaterPrice.toString())
    .multipliedBy(balanceInSturdy.toString())
    .dividedBy(Math.pow(10, collateralDecimals));

  const debtTokenAddress = (await helpersContract.getReserveTokensAddresses(repayAsset))
    .variableDebtTokenAddress;
  const varDebtToken = await getVariableDebtToken(debtTokenAddress);
  const debtAmount = await varDebtToken.balanceOf(user.address);
  const debtDecimals = await varDebtToken.decimals();
  const debtTokenPrice = await oracle.getAssetPrice(repayAsset);
  const debtInETH = new BigNumber(debtTokenPrice.toString())
    .multipliedBy(debtAmount.toString())
    .dividedBy(Math.pow(10, debtDecimals));

  const amountInETH = calcExpectedMaxWithdrawalAmount(
    userGlobalDataBefore.totalCollateralETH.toString(),
    userGlobalDataBefore.totalDebtETH.toString(),
    userGlobalDataBefore.healthFactor.toString(),
    userGlobalDataBefore.currentLiquidationThreshold.toString(),
    balanceInETH.toString(),
    liquidationThreshold.toString(),
    debtInETH.toString()
  );

  return amountInETH
    .multipliedBy(Math.pow(10, collateralDecimals))
    .dividedBy(collaterPrice.toString())
    .toFixed(0);
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

makeSuite('# Scenario 1: FRAXUSDC Leverage & FRAXUSDC Deleverage', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage = 200;
  const iterations = 3;
  let fraxusdcLevSwap = {} as GeneralLevSwap;
  let ltv = '';
  let user;

  before(async () => {
    const { helpersContract, cvxfrax_usdc, users } = testEnv;
    fraxusdcLevSwap = await getCollateralLevSwapper(testEnv, cvxfrax_usdc.address);
    ltv = (await helpersContract.getReserveConfigurationData(cvxfrax_usdc.address)).ltv.toString();
    user = users[0];
  });
  it('Leverage FRAXUSDC with USDT', async () => {
    const { usdt, FRAX_USDC_LP, pool, helpersContract } = testEnv;

    const principalAmount = (
      await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
    ).toString();

    // Prepare Collateral
    await mint('FRAX_USDC_LP', principalAmount, user, testEnv);
    await FRAX_USDC_LP.connect(user.signer).approve(fraxusdcLevSwap.address, principalAmount);

    // approve delegate borrow
    const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
      .variableDebtTokenAddress;
    const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
    await varDebtToken
      .connect(user.signer)
      .approveDelegation(fraxusdcLevSwap.address, constants.MaxUint256.toString());

    const userGlobalDataBefore = await pool.getUserAccountData(user.address);
    expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
    expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

    // leverage
    await fraxusdcLevSwap
      .connect(user.signer)
      .enterPosition(principalAmount, iterations, ltv, usdt.address);

    const userGlobalDataAfter = await pool.getUserAccountData(user.address);

    expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
    expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
    expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
      oneEther.toFixed(0),
      INVALID_HF
    );
  });
  it('Deleverage FRAXUSDC with USDT', async () => {
    const { usdt, aCVXFRAX_USDC, FRAX_USDC_LP, pool, cvxfrax_usdc } = testEnv;

    const slippage2 = '100';
    const slippage1 = '100';

    let userGlobalDataBeforeLeave = await pool.getUserAccountData(user.address);
    const beforeBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(user.address);
    expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

    //de-leverage 10% amount
    let balanceInSturdy = await aCVXFRAX_USDC.balanceOf(user.address);
    await aCVXFRAX_USDC
      .connect(user.signer)
      .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

    const principalAmount = (
      await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
    ).toString();

    const withdrawAmount = await calcMaxWithdrawalAmount(
      testEnv,
      user,
      cvxfrax_usdc.address,
      usdt.address
    );

    console.log('Required:', withdrawAmount.toString());
    await fraxusdcLevSwap
      .connect(user.signer)
      .leavePositionWithFlashloan(
        principalAmount,
        slippage1,
        slippage2,
        usdt.address,
        aCVXFRAX_USDC.address
      );

    let userGlobalDataAfterLeave = await pool.getUserAccountData(user.address);
    let afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(user.address);
    console.log('Received:', afterBalanceOfBorrower.toString());

    expect(
      afterBalanceOfBorrower.mul('100').div(withdrawAmount.toString()).toString()
    ).to.be.bignumber.gte('99');
    expect(
      afterBalanceOfBorrower.mul('100').div(withdrawAmount.toString()).toString()
    ).to.be.bignumber.lte('101');
    expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
      userGlobalDataBeforeLeave.healthFactor.toString(),
      INVALID_HF
    );
  });
});

makeSuite('# Scenario 2: FRAX3CRV Deposit, FRAXUSDC Leverage & Deleverage', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage = 200;
  const iterations = 3;
  let fraxusdcLevSwap = {} as GeneralLevSwap;
  let ltv = '';
  let user;

  before(async () => {
    const { helpersContract, cvxfrax_usdc, users } = testEnv;
    fraxusdcLevSwap = await getCollateralLevSwapper(testEnv, cvxfrax_usdc.address);
    ltv = (await helpersContract.getReserveConfigurationData(cvxfrax_usdc.address)).ltv.toString();
    user = users[0];
  });
  it('Deposit FRAX_3CRV', async () => {
    const { FRAX_3CRV_LP, convexFRAX3CRVVault, cvxfrax_3crv, aCVXFRAX_3CRV } = testEnv;

    const principalAmount = (
      await convertToCurrencyDecimals(FRAX_3CRV_LP.address, LPAmount)
    ).toString();

    // Prepare Collateral
    await mint('FRAX_3CRV_LP', principalAmount, user, testEnv);
    await FRAX_3CRV_LP.connect(user.signer).approve(convexFRAX3CRVVault.address, principalAmount);

    await convexFRAX3CRVVault
      .connect(user.signer)
      .depositCollateral(FRAX_3CRV_LP.address, principalAmount);

    expect(await FRAX_3CRV_LP.balanceOf(user.address)).to.be.equal(0);
    expect(await cvxfrax_3crv.balanceOf(convexFRAX3CRVVault.address)).to.be.equal(0);
    expect(await aCVXFRAX_3CRV.balanceOf(convexFRAX3CRVVault.address)).to.be.equal(0);
    expect(await aCVXFRAX_3CRV.balanceOf(user.address)).to.be.gte(principalAmount);
  });
  it('Leverage FRAXUSDC with USDT', async () => {
    const { usdt, FRAX_USDC_LP, pool, helpersContract } = testEnv;

    const principalAmount = (
      await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
    ).toString();

    // Prepare Collateral
    await mint('FRAX_USDC_LP', principalAmount, user, testEnv);
    await FRAX_USDC_LP.connect(user.signer).approve(fraxusdcLevSwap.address, principalAmount);

    // approve delegate borrow
    const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
      .variableDebtTokenAddress;
    const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
    await varDebtToken
      .connect(user.signer)
      .approveDelegation(fraxusdcLevSwap.address, constants.MaxUint256.toString());

    const userGlobalDataBefore = await pool.getUserAccountData(user.address);
    // expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
    expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

    // leverage
    await fraxusdcLevSwap
      .connect(user.signer)
      .enterPosition(principalAmount, iterations, ltv, usdt.address);

    const userGlobalDataAfter = await pool.getUserAccountData(user.address);

    expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
    expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
    expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
      oneEther.toFixed(0),
      INVALID_HF
    );
  });
  it('Deleverage FRAXUSDC with USDT', async () => {
    const { usdt, aCVXFRAX_USDC, FRAX_USDC_LP, pool, cvxfrax_usdc } = testEnv;

    const slippage2 = '100';
    const slippage1 = '100';

    let userGlobalDataBeforeLeave = await pool.getUserAccountData(user.address);
    const beforeBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(user.address);
    expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

    //de-leverage
    let balanceInSturdy = await aCVXFRAX_USDC.balanceOf(user.address);
    await aCVXFRAX_USDC
      .connect(user.signer)
      .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

    const principalAmount = (
      await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
    ).toString();

    const withdrawAmount = await calcMaxWithdrawalAmount(
      testEnv,
      user,
      cvxfrax_usdc.address,
      usdt.address
    );

    console.log('Required:', withdrawAmount.toString());
    await fraxusdcLevSwap
      .connect(user.signer)
      .leavePositionWithFlashloan(
        principalAmount,
        slippage1,
        slippage2,
        usdt.address,
        aCVXFRAX_USDC.address
      );

    let userGlobalDataAfterLeave = await pool.getUserAccountData(user.address);
    let afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(user.address);
    console.log('Received:', afterBalanceOfBorrower.toString());

    expect(
      afterBalanceOfBorrower.mul('100').div(withdrawAmount.toString()).toString()
    ).to.be.bignumber.gte('99');
    expect(
      afterBalanceOfBorrower.mul('100').div(withdrawAmount.toString()).toString()
    ).to.be.bignumber.lte('101');
    expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
      userGlobalDataBeforeLeave.healthFactor.toString(),
      INVALID_HF
    );
  });
});

makeSuite(
  '# Scenario 3: FRAX3CRV Leverage using USDT, FRAXUSDC Leverage using USDT & Deleverage',
  (testEnv) => {
    const { INVALID_HF } = ProtocolErrors;
    const LPAmount = '1000';
    const slippage = 200;
    const iterations = 3;
    let fraxusdcLevSwap = {} as GeneralLevSwap;
    let frax3crvLevSwap = {} as GeneralLevSwap;
    let ltv = '';
    let user;

    before(async () => {
      const { helpersContract, cvxfrax_usdc, cvxfrax_3crv, users } = testEnv;
      fraxusdcLevSwap = await getCollateralLevSwapper(testEnv, cvxfrax_usdc.address);
      frax3crvLevSwap = await getCollateralLevSwapper(testEnv, cvxfrax_3crv.address);
      ltv = (
        await helpersContract.getReserveConfigurationData(cvxfrax_usdc.address)
      ).ltv.toString();
      user = users[0];
    });
    it('Leverage FRAX_3CRV with USDT', async () => {
      const { usdt, FRAX_3CRV_LP, pool, helpersContract } = testEnv;

      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_3CRV_LP.address, LPAmount)
      ).toString();

      // Prepare Collateral
      await mint('FRAX_3CRV_LP', principalAmount, user, testEnv);
      await FRAX_3CRV_LP.connect(user.signer).approve(frax3crvLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(user.signer)
        .approveDelegation(frax3crvLevSwap.address, constants.MaxUint256.toString());

      const userGlobalDataBefore = await pool.getUserAccountData(user.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await frax3crvLevSwap
        .connect(user.signer)
        .enterPosition(principalAmount, iterations, ltv, usdt.address);

      const userGlobalDataAfter = await pool.getUserAccountData(user.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
    it('Leverage FRAXUSDC with USDT', async () => {
      const { usdt, FRAX_USDC_LP, pool, helpersContract } = testEnv;

      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
      ).toString();

      // Prepare Collateral
      await mint('FRAX_USDC_LP', principalAmount, user, testEnv);
      await FRAX_USDC_LP.connect(user.signer).approve(fraxusdcLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(user.signer)
        .approveDelegation(fraxusdcLevSwap.address, constants.MaxUint256.toString());

      const userGlobalDataBefore = await pool.getUserAccountData(user.address);
      // expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      // expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await fraxusdcLevSwap
        .connect(user.signer)
        .enterPosition(principalAmount, iterations, ltv, usdt.address);

      const userGlobalDataAfter = await pool.getUserAccountData(user.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
    it('Deleverage FRAXUSDC with USDT', async () => {
      const { usdt, aCVXFRAX_USDC, FRAX_USDC_LP, pool, cvxfrax_usdc } = testEnv;

      const slippage2 = '100';
      const slippage1 = '100';

      let userGlobalDataBeforeLeave = await pool.getUserAccountData(user.address);
      const beforeBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(user.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage
      let balanceInSturdy = await aCVXFRAX_USDC.balanceOf(user.address);
      await aCVXFRAX_USDC
        .connect(user.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      const withdrawAmount = await calcMaxWithdrawalAmount(
        testEnv,
        user,
        cvxfrax_usdc.address,
        usdt.address
      );

      console.log('Required:', withdrawAmount.toString());
      await fraxusdcLevSwap
        .connect(user.signer)
        .leavePositionWithFlashloan(
          withdrawAmount,
          slippage1,
          slippage2,
          usdt.address,
          aCVXFRAX_USDC.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(user.address);
      let afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(user.address);
      console.log('Received:', afterBalanceOfBorrower.toString());

      expect(
        afterBalanceOfBorrower.mul('100').div(withdrawAmount.toString()).toString()
      ).to.be.bignumber.gte('99');
      expect(
        afterBalanceOfBorrower.mul('100').div(withdrawAmount.toString()).toString()
      ).to.be.bignumber.lte('101');

      expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
        userGlobalDataBeforeLeave.healthFactor.toString(),
        INVALID_HF
      );
    });
  }
);

makeSuite(
  '# Scenario 4: FRAX3CRV Leverage using DAI, FRAXUSDC Leverage using USDT & Deleverage',
  (testEnv) => {
    const { INVALID_HF } = ProtocolErrors;
    const LPAmount = '1000';
    const slippage = 200;
    const iterations = 3;
    let fraxusdcLevSwap = {} as GeneralLevSwap;
    let frax3crvLevSwap = {} as GeneralLevSwap;
    let ltv = '';
    let user;

    before(async () => {
      const { helpersContract, cvxfrax_usdc, cvxfrax_3crv, users } = testEnv;
      fraxusdcLevSwap = await getCollateralLevSwapper(testEnv, cvxfrax_usdc.address);
      frax3crvLevSwap = await getCollateralLevSwapper(testEnv, cvxfrax_3crv.address);
      ltv = (
        await helpersContract.getReserveConfigurationData(cvxfrax_usdc.address)
      ).ltv.toString();
      user = users[0];
    });
    it('Leverage FRAX_3CRV using DAI', async () => {
      const { dai, FRAX_3CRV_LP, pool, helpersContract } = testEnv;

      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_3CRV_LP.address, LPAmount)
      ).toString();

      // Prepare Collateral
      await mint('FRAX_3CRV_LP', principalAmount, user, testEnv);
      await FRAX_3CRV_LP.connect(user.signer).approve(frax3crvLevSwap.address, principalAmount);

      // approve delegate borrow
      const debtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(debtTokenAddress);
      await varDebtToken
        .connect(user.signer)
        .approveDelegation(frax3crvLevSwap.address, constants.MaxUint256.toString());

      const userGlobalDataBefore = await pool.getUserAccountData(user.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await frax3crvLevSwap
        .connect(user.signer)
        .enterPosition(principalAmount, iterations, ltv, dai.address);

      const userGlobalDataAfter = await pool.getUserAccountData(user.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
    it('Leverage FRAXUSDC with USDT', async () => {
      const { usdt, FRAX_USDC_LP, pool, helpersContract } = testEnv;

      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
      ).toString();

      // Prepare Collateral
      await mint('FRAX_USDC_LP', principalAmount, user, testEnv);
      await FRAX_USDC_LP.connect(user.signer).approve(fraxusdcLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(user.signer)
        .approveDelegation(fraxusdcLevSwap.address, constants.MaxUint256.toString());

      const userGlobalDataBefore = await pool.getUserAccountData(user.address);
      // expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      // expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      await fraxusdcLevSwap
        .connect(user.signer)
        .enterPosition(principalAmount, iterations, ltv, usdt.address);

      const userGlobalDataAfter = await pool.getUserAccountData(user.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );
    });
    it('Deleverage FRAXUSDC with USDT', async () => {
      const { usdt, aCVXFRAX_USDC, FRAX_USDC_LP, pool, cvxfrax_usdc } = testEnv;

      const slippage2 = '100';
      const slippage1 = '100';

      let userGlobalDataBeforeLeave = await pool.getUserAccountData(user.address);
      const beforeBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(user.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage
      let balanceInSturdy = await aCVXFRAX_USDC.balanceOf(user.address);
      await aCVXFRAX_USDC
        .connect(user.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      const withdrawAmount = await calcMaxWithdrawalAmount(
        testEnv,
        user,
        cvxfrax_usdc.address,
        usdt.address
      );

      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
      ).toString();

      console.log('Required:', withdrawAmount.toString());
      await fraxusdcLevSwap
        .connect(user.signer)
        .leavePositionWithFlashloan(
          principalAmount,
          slippage1,
          slippage2,
          usdt.address,
          aCVXFRAX_USDC.address
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(user.address);
      let afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(user.address);
      console.log('Received:', afterBalanceOfBorrower.toString());

      expect(
        afterBalanceOfBorrower.mul('100').div(withdrawAmount.toString()).toString()
      ).to.be.bignumber.gte('99');
      expect(
        afterBalanceOfBorrower.mul('100').div(withdrawAmount.toString()).toString()
      ).to.be.bignumber.lte('101');

      expect(userGlobalDataAfterLeave.healthFactor.toString()).to.be.bignumber.gt(
        userGlobalDataBeforeLeave.healthFactor.toString(),
        INVALID_HF
      );
    });
  }
);
