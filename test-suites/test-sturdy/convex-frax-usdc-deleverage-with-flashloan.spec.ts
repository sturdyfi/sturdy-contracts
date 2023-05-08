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
} from '../../types';
import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';

const chai = require('chai');
const { expect } = chai;

const slippage = 0.0002; //0.02%
const THREE_CRV_POOL = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7';
const FRAXUSDC_POOL = '0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2';
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
  const { usdc, dai, usdt, FRAX_USDC_LP } = testEnv;
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
  } else if (reserveSymbol == 'FRAX_USDC_LP') {
    ownerAddress = '0xE9e5861d73A523000FE755034a8a612496079C50';
    token = FRAX_USDC_LP;
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

const calcCollateralPrice = async (testEnv: TestEnv) => {
  const { deployer, oracle, usdc, FRAX, FRAX_USDC_LP } = testEnv;
  const FRAXUSDCPool = ICurvePool__factory.connect(FRAXUSDC_POOL, deployer.signer);
  const fraxPrice = await oracle.getAssetPrice(FRAX.address);
  const fraxTotalBalance = await FRAXUSDCPool['balances(uint256)'](0);
  const usdcPrice = await oracle.getAssetPrice(usdc.address);
  const usdcTotalBalance = await FRAXUSDCPool['balances(uint256)'](1);
  const lpTotalSupply = await FRAX_USDC_LP.totalSupply();

  return new BigNumber(fraxPrice.toString())
    .multipliedBy(fraxTotalBalance.toString())
    .dividedBy(1e18)
    .plus(
      new BigNumber(usdcPrice.toString()).multipliedBy(usdcTotalBalance.toString()).dividedBy(1e6)
    )
    .multipliedBy(1e18)
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
      .div(1 - 0.0065) // flashloan fee + extra(swap loss) = 0.65%
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
    return await curvePool.get_dy(fromIndex, toIndex, amount);
  }

  return await curvePool['calc_withdraw_one_coin(uint256,int128)'](amount, toIndex);
};

makeSuite('FRAXUSDC Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const leverage = 36000;
  let fraxusdcLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxfrax_usdc, vaultWhitelist, convexFRAXUSDCVault, users, owner } =
      testEnv;
    fraxusdcLevSwap = await getCollateralLevSwapper(testEnv, cvxfrax_usdc.address);
    ltv = (await helpersContract.getReserveConfigurationData(cvxfrax_usdc.address)).ltv.toString();
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexFRAXUSDCVault.address, fraxusdcLevSwap.address);
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistUser(convexFRAXUSDCVault.address, users[0].address);
  });
  describe('leavePosition - full amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        usdc,
        aCVXFRAX_USDC,
        FRAX_USDC_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexFRAXUSDCVault,
        owner,
      } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          FRAX_USDC_LP.address,
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
      await mint('FRAX_USDC_LP', principalAmount, borrower, testEnv);
      await FRAX_USDC_LP.connect(borrower.signer).approve(fraxusdcLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(fraxusdcLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 2, 1, inAmount, false, false, true, THREE_CRV_POOL)
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
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              THREE_CRV_POOL,
              usdc.address,
              FRAXUSDC_POOL,
              FRAX_USDC_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [2, 1, 1 /*exchange*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: usdt.address,
            swapTo: FRAX_USDC_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              FRAX_USDC_LP.address,
              FRAXUSDC_POOL,
              usdc.address,
              THREE_CRV_POOL,
              usdt.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [1, 2, 1 /*exchange*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: FRAX_USDC_LP.address,
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
        fraxusdcLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexFRAXUSDCVault.address, borrower.address);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount.toString(),
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
        usdt.address
      );
      const reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            true,
            false,
            false,
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            2,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          usdt.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
    it('USDC as borrowing asset', async () => {
      const {
        users,
        usdc,
        FRAX_USDC_LP,
        aCVXFRAX_USDC,
        pool,
        helpersContract,
        vaultWhitelist,
        convexFRAXUSDCVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          FRAX_USDC_LP.address,
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
      await mint('FRAX_USDC_LP', principalAmount, borrower, testEnv);
      await FRAX_USDC_LP.connect(borrower.signer).approve(fraxusdcLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(fraxusdcLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 1, 0, inAmount, true, true, false, FRAXUSDC_POOL)
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              FRAXUSDC_POOL,
              FRAX_USDC_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: usdc.address,
            swapTo: FRAX_USDC_LP.address,
            inAmount,
            outAmount: expectOutAmount1.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              FRAX_USDC_LP.address,
              FRAXUSDC_POOL,
              usdc.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: FRAX_USDC_LP.address,
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
        fraxusdcLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexFRAXUSDCVault.address, borrower.address);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount.toString(),
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
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
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount1.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          usdc.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
    it('DAI as borrowing asset', async () => {
      const {
        users,
        dai,
        usdc,
        FRAX_USDC_LP,
        aCVXFRAX_USDC,
        pool,
        helpersContract,
        vaultWhitelist,
        convexFRAXUSDCVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          FRAX_USDC_LP.address,
          LPAmount,
          ltv,
          leverage,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('FRAX_USDC_LP', principalAmount, borrower, testEnv);
      await FRAX_USDC_LP.connect(borrower.signer).approve(fraxusdcLevSwap.address, principalAmount);

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(fraxusdcLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 0, 1, inAmount, false, false, true, THREE_CRV_POOL)
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
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              THREE_CRV_POOL,
              usdc.address,
              FRAXUSDC_POOL,
              FRAX_USDC_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 1 /*exchange*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: dai.address,
            swapTo: FRAX_USDC_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              FRAX_USDC_LP.address,
              FRAXUSDC_POOL,
              usdc.address,
              THREE_CRV_POOL,
              dai.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [1, 0, 1 /*exchange*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: FRAX_USDC_LP.address,
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
        fraxusdcLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexFRAXUSDCVault.address, borrower.address);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount.toString(),
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
        dai.address
      );
      const reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            true,
            false,
            false,
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          dai.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
  });
});

makeSuite('FRAXUSDC Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const leverage = 36000;
  let fraxusdcLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxfrax_usdc, vaultWhitelist, convexFRAXUSDCVault, users, owner } =
      testEnv;
    fraxusdcLevSwap = await getCollateralLevSwapper(testEnv, cvxfrax_usdc.address);
    ltv = (await helpersContract.getReserveConfigurationData(cvxfrax_usdc.address)).ltv.toString();
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexFRAXUSDCVault.address, fraxusdcLevSwap.address);
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistUser(convexFRAXUSDCVault.address, users[0].address);
  });
  describe('leavePosition - partial amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        usdc,
        aCVXFRAX_USDC,
        FRAX_USDC_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexFRAXUSDCVault,
        owner,
      } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          FRAX_USDC_LP.address,
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
      await mint('FRAX_USDC_LP', principalAmount, borrower, testEnv);
      await FRAX_USDC_LP.connect(borrower.signer).approve(fraxusdcLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(fraxusdcLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 2, 1, inAmount, false, false, true, THREE_CRV_POOL)
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
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              THREE_CRV_POOL,
              usdc.address,
              FRAXUSDC_POOL,
              FRAX_USDC_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [2, 1, 1 /*exchange*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: usdt.address,
            swapTo: FRAX_USDC_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              FRAX_USDC_LP.address,
              FRAXUSDC_POOL,
              usdc.address,
              THREE_CRV_POOL,
              usdt.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [1, 2, 1 /*exchange*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: FRAX_USDC_LP.address,
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
        fraxusdcLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexFRAXUSDCVault.address, borrower.address);
      await fraxusdcLevSwap
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

      const beforeBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
        usdt.address
      );
      let reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            true,
            false,
            false,
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      let reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            2,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          usdt.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
        usdt.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            true,
            false,
            false,
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            2,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          usdt.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
        usdt.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            true,
            false,
            false,
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            2,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          usdt.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
        usdt.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            true,
            false,
            false,
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            2,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          usdt.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
      const {
        users,
        usdc,
        FRAX_USDC_LP,
        aCVXFRAX_USDC,
        pool,
        helpersContract,
        vaultWhitelist,
        convexFRAXUSDCVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          FRAX_USDC_LP.address,
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
      await mint('FRAX_USDC_LP', principalAmount, borrower, testEnv);
      await FRAX_USDC_LP.connect(borrower.signer).approve(fraxusdcLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(fraxusdcLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 1, 0, inAmount, true, true, false, FRAXUSDC_POOL)
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              FRAXUSDC_POOL,
              FRAX_USDC_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: usdc.address,
            swapTo: FRAX_USDC_LP.address,
            inAmount,
            outAmount: expectOutAmount1.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              FRAX_USDC_LP.address,
              FRAXUSDC_POOL,
              usdc.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: FRAX_USDC_LP.address,
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
        fraxusdcLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexFRAXUSDCVault.address, borrower.address);
      await fraxusdcLevSwap
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

      const beforeBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
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
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount1.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          usdc.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
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
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount1.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          usdc.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
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
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount1.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          usdc.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
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
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount1.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          usdc.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
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
      const {
        users,
        dai,
        usdc,
        FRAX_USDC_LP,
        aCVXFRAX_USDC,
        pool,
        helpersContract,
        vaultWhitelist,
        convexFRAXUSDCVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(FRAX_USDC_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          FRAX_USDC_LP.address,
          LPAmount,
          ltv,
          leverage,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('FRAX_USDC_LP', principalAmount, borrower, testEnv);
      await FRAX_USDC_LP.connect(borrower.signer).approve(fraxusdcLevSwap.address, principalAmount);

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(fraxusdcLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 0, 1, inAmount, false, false, true, THREE_CRV_POOL)
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
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              THREE_CRV_POOL,
              usdc.address,
              FRAXUSDC_POOL,
              FRAX_USDC_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 1 /*exchange*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: dai.address,
            swapTo: FRAX_USDC_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              FRAX_USDC_LP.address,
              FRAXUSDC_POOL,
              usdc.address,
              THREE_CRV_POOL,
              dai.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [1, 0, 1 /*exchange*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: FRAX_USDC_LP.address,
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
        fraxusdcLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexFRAXUSDCVault.address, borrower.address);
      await fraxusdcLevSwap
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

      const beforeBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
        dai.address
      );
      let reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            true,
            false,
            false,
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      let reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          dai.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
        dai.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            true,
            false,
            false,
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          dai.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
        dai.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            true,
            false,
            false,
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          dai.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXFRAX_USDC.balanceOf(borrower.address);
      await aCVXFRAX_USDC
        .connect(borrower.signer)
        .approve(fraxusdcLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        FRAX_USDC_LP.address,
        dai.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseInAmount.toFixed(0),
            true,
            false,
            false,
            FRAXUSDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            reverseExpectOutAmount1.toFixed(0),
            false,
            false,
            true,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await fraxusdcLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          dai.address,
          aCVXFRAX_USDC.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await FRAX_USDC_LP.balanceOf(borrower.address);
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
