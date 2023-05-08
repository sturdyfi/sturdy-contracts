import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { oneEther, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals, convertToCurrencyUnits } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import {
  ICurvePool__factory,
  IGeneralLevSwap,
  IGeneralLevSwap__factory,
  MintableERC20,
  MintableERC20__factory,
  TUSDFRAXBPLevSwap,
} from '../../types';
import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';

const chai = require('chai');
const { expect } = chai;

const slippage = 0.0002; //0.02%
const FRAX_USDC_LP = '0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC';
const FRAX_USDC_POOL = '0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2';
const TUSDFRAXBP_POOL = '0x33baeDa08b8afACc4d3d07cf31d49FC1F1f3E893';
const TUSD3CRV_POOL = '0xecd5e75afb02efa118af914515d6521aabd189f1';
const MultiSwapPathInitData = {
  routes: new Array(9).fill(ZERO_ADDRESS),
  routeParams: new Array(4).fill([0, 0, 0]) as any,
  swapType: 0, //NONE
  poolCount: 0,
  swapFrom: ZERO_ADDRESS,
  swapTo: ZERO_ADDRESS,
  inAmount: '0',
  outAmount: '0',
};

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
    ownerAddress = '0x566cdC415fDF629a47e365B5FDfAdCE51a2F8752';
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
      .multipliedBy(1.5) // make enough amount
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

const calcFRAXUSDCPrice = async (testEnv: TestEnv) => {
  const { deployer, oracle, FRAX, usdc } = testEnv;
  const FRAXUSDCPool = ICurvePool__factory.connect(FRAX_USDC_POOL, deployer.signer);
  const FRAXUSDCLP = MintableERC20__factory.connect(FRAX_USDC_LP, deployer.signer);
  const fraxPrice = await oracle.getAssetPrice(FRAX.address);
  const fraxTotalBalance = await FRAXUSDCPool['balances(uint256)'](0);
  const usdcPrice = await oracle.getAssetPrice(usdc.address);
  const usdcTotalBalance = await FRAXUSDCPool['balances(uint256)'](1);
  const FRAXUSDCLpTotalSupply = await FRAXUSDCLP.totalSupply();

  return new BigNumber(fraxPrice.toString())
    .multipliedBy(fraxTotalBalance.toString())
    .dividedBy(1e18)
    .plus(
      new BigNumber(usdcPrice.toString()).multipliedBy(usdcTotalBalance.toString()).dividedBy(1e6)
    )
    .multipliedBy(1e18)
    .dividedBy(FRAXUSDCLpTotalSupply.toString());
};

const calcCollateralPrice = async (testEnv: TestEnv) => {
  const { deployer, oracle, TUSD, TUSD_FRAXBP_LP } = testEnv;
  const TUSDFRAXBPPool = ICurvePool__factory.connect(TUSDFRAXBP_POOL, deployer.signer);
  const tusdPrice = await oracle.getAssetPrice(TUSD.address);
  const tusdTotalBalance = await TUSDFRAXBPPool['balances(uint256)'](0);
  const FRAXUSDCPrice = await calcFRAXUSDCPrice(testEnv);
  const FRAXUSDCTotalBalance = await TUSDFRAXBPPool['balances(uint256)'](1);
  const lpTotalSupply = await TUSD_FRAXBP_LP.totalSupply();

  return new BigNumber(tusdPrice.toString())
    .multipliedBy(tusdTotalBalance.toString())
    .plus(new BigNumber(FRAXUSDCPrice.toString()).multipliedBy(FRAXUSDCTotalBalance.toString()))
    .dividedBy(lpTotalSupply.toString());
};

const calcWithdrawalAmount = async (
  testEnv: TestEnv,
  totalCollateralETH: BigNumberish,
  totalDebtETH: BigNumberish,
  repayAmount: BigNumberish,
  currentLiquidationThreshold: BigNumberish,
  assetLiquidationThreshold: BigNumberish,
  collateralAmount: BigNumberish,
  collateral: tEthereumAddress,
  borrowingAsset: tEthereumAddress
) => {
  const { oracle } = testEnv;
  const collateralPrice = await oracle.getAssetPrice(collateral);
  const borrowingAssetPrice = await oracle.getAssetPrice(borrowingAsset);
  const repayAmountETH = new BigNumber(
    await convertToCurrencyUnits(borrowingAsset, repayAmount.toString())
  ).multipliedBy(borrowingAssetPrice.toString());
  const withdrawalAmountETH = new BigNumber(totalCollateralETH.toString())
    .multipliedBy(currentLiquidationThreshold.toString())
    .dividedBy(10000)
    .minus(totalDebtETH.toString())
    .plus(repayAmountETH.toFixed(0))
    .multipliedBy(10000)
    .dividedBy(assetLiquidationThreshold.toString())
    .dp(0, 1); //round down with decimal 0

  return BigNumber.min(
    collateralAmount.toString(),
    (
      await convertToCurrencyDecimals(
        collateral,
        withdrawalAmountETH
          .dividedBy(collateralPrice.toString())
          .dp(18, 1) //round down with decimal 0
          .toFixed(18)
      )
    ).toString()
  );
};

const calcInAmount = async (
  testEnv: TestEnv,
  amount: BigNumberish,
  leverage: BigNumberish,
  borrowingAsset: tEthereumAddress
) => {
  const { oracle } = testEnv;
  const collateralPrice = await calcCollateralPrice(testEnv);
  const borrowingAssetPrice = await oracle.getAssetPrice(borrowingAsset);

  const intputAmount = await convertToCurrencyDecimals(
    borrowingAsset,
    new BigNumber(amount.toString())
      .multipliedBy(leverage.toString())
      .div(10000)
      .multipliedBy(collateralPrice.toFixed(0))
      .div(borrowingAssetPrice.toString())
      .div(1 - 0.008) // flashloan fee + extra(swap loss) = 0.8%
      .toFixed(0)
  );

  return intputAmount;
};

const calcMinAmountOut = async (
  testEnv: TestEnv,
  fromIndex: number,
  toIndex: number,
  amount: BigNumberish,
  isDeposit: boolean,
  isCalcTokenAmount: boolean,
  isExchange: boolean,
  pool: tEthereumAddress
) => {
  const { deployer } = testEnv;

  const curvePool = ICurvePool__factory.connect(pool, deployer.signer);
  if (isCalcTokenAmount) {
    const amounts = new Array<BigNumberish>(2).fill('0');
    amounts[fromIndex] = amount;

    return await curvePool['calc_token_amount(uint256[2],bool)'](amounts as any, isDeposit);
  }

  if (isExchange) {
    return await curvePool.get_dy_underlying(fromIndex, toIndex, amount);
  }

  return await curvePool['calc_withdraw_one_coin(uint256,int128)'](amount, toIndex);
};

makeSuite('TUSDFRAXBP Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const leverage = 36000;
  let tusdfraxbpLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxtusd_fraxbp, vaultWhitelist, convexTUSDFRAXBPVault, users, owner } =
      testEnv;
    tusdfraxbpLevSwap = await getCollateralLevSwapper(testEnv, cvxtusd_fraxbp.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxtusd_fraxbp.address)
    ).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexTUSDFRAXBPVault.address, tusdfraxbpLevSwap.address);
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistUser(convexTUSDFRAXBPVault.address, users[0].address);
  });
  describe('leavePosition - full amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        TUSD,
        aCVXTUSD_FRAXBP,
        TUSD_FRAXBP_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexTUSDFRAXBPVault,
        owner,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 3, 0, inAmount, false, false, true, TUSD3CRV_POOL)
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            expectOutAmount1.toFixed(0),
            true,
            true,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              TUSD3CRV_POOL,
              TUSD.address,
              TUSDFRAXBP_POOL,
              TUSD_FRAXBP_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [3, 0, 2 /*exchange_underlying*/],
              [0, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: usdt.address,
            swapTo: TUSD_FRAXBP_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              TUSD_FRAXBP_LP.address,
              TUSDFRAXBP_POOL,
              TUSD.address,
              TUSD3CRV_POOL,
              usdt.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 0, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 3, 2 /*exchange_underlying*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: TUSD_FRAXBP_LP.address,
            swapTo: usdt.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexTUSDFRAXBPVault.address, borrower.address);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo);

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
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount.toString(),
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        usdt.address
      );
      const reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            3,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            TUSD3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await vaultWhitelist
        .connect(owner.signer)
        .removeAddressFromWhitelistUser(convexTUSDFRAXBPVault.address, borrower.address);

      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            usdt.address,
            aCVXTUSD_FRAXBP.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexTUSDFRAXBPVault.address, borrower.address);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          usdt.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
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
        owner,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 1, 0, inAmount, true, true, false, FRAX_USDC_POOL)
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            expectOutAmount1.toFixed(0),
            true,
            true,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              FRAX_USDC_POOL,
              FRAX_USDC_LP,
              TUSDFRAXBP_POOL,
              TUSD_FRAXBP_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: usdc.address,
            swapTo: TUSD_FRAXBP_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              TUSD_FRAXBP_LP.address,
              TUSDFRAXBP_POOL,
              FRAX_USDC_LP,
              FRAX_USDC_POOL,
              usdc.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: TUSD_FRAXBP_LP.address,
            swapTo: usdc.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexTUSDFRAXBPVault.address, borrower.address);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo);

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
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount.toString(),
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        usdc.address
      );
      const reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            false,
            FRAX_USDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await vaultWhitelist
        .connect(owner.signer)
        .removeAddressFromWhitelistUser(convexTUSDFRAXBPVault.address, borrower.address);
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            usdc.address,
            aCVXTUSD_FRAXBP.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexTUSDFRAXBPVault.address, borrower.address);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          usdc.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
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
        TUSD,
        TUSD_FRAXBP_LP,
        aCVXTUSD_FRAXBP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexTUSDFRAXBPVault,
        owner,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 1, 0, inAmount, false, false, true, TUSD3CRV_POOL)
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            expectOutAmount1.toFixed(0),
            true,
            true,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              TUSD3CRV_POOL,
              TUSD.address,
              TUSDFRAXBP_POOL,
              TUSD_FRAXBP_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 2 /*exchange_underlying*/],
              [0, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: dai.address,
            swapTo: TUSD_FRAXBP_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              TUSD_FRAXBP_LP.address,
              TUSDFRAXBP_POOL,
              TUSD.address,
              TUSD3CRV_POOL,
              dai.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 0, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 1, 2 /*exchange_underlying*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: TUSD_FRAXBP_LP.address,
            swapTo: dai.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexTUSDFRAXBPVault.address, borrower.address);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo);

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
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount.toString(),
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        dai.address
      );
      const reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            TUSD3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await vaultWhitelist
        .connect(owner.signer)
        .removeAddressFromWhitelistUser(convexTUSDFRAXBPVault.address, borrower.address);
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            dai.address,
            aCVXTUSD_FRAXBP.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexTUSDFRAXBPVault.address, borrower.address);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          dai.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
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
  const leverage = 36000;
  let tusdfraxbpLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxtusd_fraxbp, vaultWhitelist, convexTUSDFRAXBPVault, owner } =
      testEnv;
    tusdfraxbpLevSwap = await getCollateralLevSwapper(testEnv, cvxtusd_fraxbp.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxtusd_fraxbp.address)
    ).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexTUSDFRAXBPVault.address, tusdfraxbpLevSwap.address);
  });
  describe('leavePosition - partial amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, TUSD, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP, pool, helpersContract } = testEnv;

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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 3, 0, inAmount, false, false, true, TUSD3CRV_POOL)
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            expectOutAmount1.toFixed(0),
            true,
            true,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              TUSD3CRV_POOL,
              TUSD.address,
              TUSDFRAXBP_POOL,
              TUSD_FRAXBP_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [3, 0, 2 /*exchange_underlying*/],
              [0, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: usdt.address,
            swapTo: TUSD_FRAXBP_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              TUSD_FRAXBP_LP.address,
              TUSDFRAXBP_POOL,
              TUSD.address,
              TUSD3CRV_POOL,
              usdt.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 0, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 3, 2 /*exchange_underlying*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: TUSD_FRAXBP_LP.address,
            swapTo: usdt.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo);

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
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        usdt.address
      );
      let reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      let reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            3,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            TUSD3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          usdt.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div((Number(principalAmount) / 10).toFixed())
          .toString()
      ).to.be.bignumber.gte('97');
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

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        usdt.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            3,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            TUSD3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          usdt.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div(((Number(principalAmount) / 10) * 3).toFixed())
          .toString()
      ).to.be.bignumber.gte('97');
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

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        usdt.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            3,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            TUSD3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          usdt.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div(((Number(principalAmount) / 10) * 6).toFixed())
          .toString()
      ).to.be.bignumber.gte('97');
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

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        usdt.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            3,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            TUSD3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          usdt.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 1, 0, inAmount, true, true, false, FRAX_USDC_POOL)
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            expectOutAmount1.toFixed(0),
            true,
            true,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              FRAX_USDC_POOL,
              FRAX_USDC_LP,
              TUSDFRAXBP_POOL,
              TUSD_FRAXBP_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: usdc.address,
            swapTo: TUSD_FRAXBP_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              TUSD_FRAXBP_LP.address,
              TUSDFRAXBP_POOL,
              FRAX_USDC_LP,
              FRAX_USDC_POOL,
              usdc.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: TUSD_FRAXBP_LP.address,
            swapTo: usdc.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo);

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
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        usdc.address
      );
      let reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      let reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            false,
            FRAX_USDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          usdc.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div((Number(principalAmount) / 10).toFixed())
          .toString()
      ).to.be.bignumber.gte('97');
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

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        usdc.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            false,
            FRAX_USDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          usdc.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div(((Number(principalAmount) / 10) * 3).toFixed())
          .toString()
      ).to.be.bignumber.gte('97');
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

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        usdc.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            false,
            FRAX_USDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          usdc.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div(((Number(principalAmount) / 10) * 6).toFixed())
          .toString()
      ).to.be.bignumber.gte('97');
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

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        usdc.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            false,
            FRAX_USDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          usdc.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
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
      const { users, dai, TUSD, TUSD_FRAXBP_LP, aCVXTUSD_FRAXBP, pool, helpersContract } = testEnv;
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 1, 0, inAmount, false, false, true, TUSD3CRV_POOL)
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            expectOutAmount1.toFixed(0),
            true,
            true,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              TUSD3CRV_POOL,
              TUSD.address,
              TUSDFRAXBP_POOL,
              TUSD_FRAXBP_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 2 /*exchange_underlying*/],
              [0, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: dai.address,
            swapTo: TUSD_FRAXBP_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              TUSD_FRAXBP_LP.address,
              TUSDFRAXBP_POOL,
              TUSD.address,
              TUSD3CRV_POOL,
              dai.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 0, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 1, 2 /*exchange_underlying*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: TUSD_FRAXBP_LP.address,
            swapTo: dai.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo);

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
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        dai.address
      );
      let reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      let reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            TUSD3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          dai.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div((Number(principalAmount) / 10).toFixed())
          .toString()
      ).to.be.bignumber.gte('97');
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

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        dai.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            TUSD3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          dai.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div(((Number(principalAmount) / 10) * 3).toFixed())
          .toString()
      ).to.be.bignumber.gte('97');
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

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        dai.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            TUSD3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          dai.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(
        afterBalanceOfBorrower
          .mul('100')
          .div(((Number(principalAmount) / 10) * 6).toFixed())
          .toString()
      ).to.be.bignumber.gte('97');
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

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        TUSD_FRAXBP_LP.address,
        dai.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            0,
            reverseInAmount.toFixed(0),
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            TUSD3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await tusdfraxbpLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          dai.address,
          aCVXTUSD_FRAXBP.address,
          0,
          swapInfo
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
