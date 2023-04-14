import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { ZERO_ADDRESS, oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import {
  getVariableDebtToken,
  getLendingPoolConfiguratorProxy,
} from '../../helpers/contracts-getters';
import { ICurvePool__factory, MintableERC20, MintableERC20__factory } from '../../types';
import { ProtocolErrors, RateMode, tEthereumAddress } from '../../helpers/types';
import { getUserData } from './helpers/utils/helpers';
import { IGeneralLevSwap__factory } from '../../types';
import { IGeneralLevSwap } from '../../types';

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

const calcETHAmount = async (testEnv: TestEnv, asset: tEthereumAddress, amount: BigNumberish) => {
  const { oracle } = testEnv;
  const assetPrice = await oracle.getAssetPrice(asset);
  const ethAmount = new BigNumber(amount.toString()).multipliedBy(assetPrice.toString()).toFixed(0);

  return ethAmount;
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

makeSuite('TUSDFRAXBP Leverage Swap', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';

  /// LTV = 0.8, slippage = 0.02, Aave fee = 0.0009
  /// leverage / (1 + leverage) <= LTV / (1 + slippage) / (1 + Aave fee)
  /// leverage / (1 + leverage) <= 0.8 / 1.02 / 1.0009 = 0.7836084
  /// leverage <= 0.7836084 / (1 - 0.7836084) = 3.62125
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
  describe('configuration', () => {
    it('DAI, USDC, USDT should be available for borrowing.', async () => {
      const { dai, usdc, usdt } = testEnv;
      const coins = (await tusdfraxbpLevSwap.getAvailableBorrowAssets()).map((coin) =>
        coin.toUpperCase()
      );
      expect(coins.length).to.be.equal(3);
      expect(coins.includes(dai.address.toUpperCase())).to.be.equal(true);
      expect(coins.includes(usdc.address.toUpperCase())).to.be.equal(true);
      expect(coins.includes(usdt.address.toUpperCase())).to.be.equal(true);
    });
  });
  describe('enterPosition(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { dai } = testEnv;
      const principalAmount = 0;
      const stableCoin = dai.address;
      const swapInfo = {
        paths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
        reversePaths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
        pathLength: 0,
      };
      await expect(
        tusdfraxbpLevSwap.enterPositionWithFlashloan(
          principalAmount,
          leverage,
          stableCoin,
          0,
          swapInfo
        )
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { aDai } = testEnv;
      const principalAmount = 10;
      const stableCoin = aDai.address;
      const swapInfo = {
        paths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
        reversePaths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
        pathLength: 0,
      };
      await expect(
        tusdfraxbpLevSwap.enterPositionWithFlashloan(
          principalAmount,
          leverage,
          stableCoin,
          0,
          swapInfo
        )
      ).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, dai, TUSD_FRAXBP_LP } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, '1000');
      const stableCoin = dai.address;
      const swapInfo = {
        paths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
        reversePaths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
        pathLength: 0,
      };
      await expect(
        tusdfraxbpLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, stableCoin, 0, swapInfo)
      ).to.be.revertedWith('115');
    });
  });
  describe('enterPosition():', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        TUSD,
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
            routes: [usdt.address, TUSD3CRV_POOL, TUSD.address, ...new Array(6).fill(ZERO_ADDRESS)],
            routeParams: [
              [3, 0, 2 /*exchange_underlying*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: usdt.address,
            swapTo: TUSD.address,
            inAmount,
            outAmount: expectOutAmount1.toFixed(0),
          },
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: TUSD.address,
            swapTo: TUSD_FRAXBP_LP.address,
            inAmount: expectOutAmount1.toFixed(0),
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: TUSD_FRAXBP_LP.address,
            swapTo: TUSD.address,
            inAmount: 0,
            outAmount: 0,
          },
          {
            routes: [TUSD.address, TUSD3CRV_POOL, usdt.address, ...new Array(6).fill(ZERO_ADDRESS)],
            routeParams: [
              [0, 3, 2 /*exchange_underlying*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 1,
            swapFrom: TUSD.address,
            swapTo: usdt.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
        ] as any,
        pathLength: 2,
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
      const collateralETHAmount = await calcETHAmount(testEnv, TUSD_FRAXBP_LP.address, LPAmount);

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
    it('USDC as borrowing asset', async () => {
      const {
        users,
        usdc,
        TUSD_FRAXBP_LP,
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
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
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
            swapTo: FRAX_USDC_LP,
            inAmount,
            outAmount: expectOutAmount1.toFixed(0),
          },
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: FRAX_USDC_LP,
            swapTo: TUSD_FRAXBP_LP.address,
            inAmount: expectOutAmount1.toFixed(0),
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: TUSD_FRAXBP_LP.address,
            swapTo: FRAX_USDC_LP,
            inAmount: 0,
            outAmount: 0,
          },
          {
            routes: [
              FRAX_USDC_LP,
              FRAX_USDC_POOL,
              usdc.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 1,
            swapFrom: FRAX_USDC_LP,
            swapTo: usdc.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
        ] as any,
        pathLength: 2,
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
      const collateralETHAmount = await calcETHAmount(testEnv, TUSD_FRAXBP_LP.address, LPAmount);

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
    it('DAI as borrowing asset', async () => {
      const {
        users,
        dai,
        TUSD,
        TUSD_FRAXBP_LP,
        pool,
        helpersContract,
        convexTUSDFRAXBPVault,
        vaultWhitelist,
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
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
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
            routes: [dai.address, TUSD3CRV_POOL, TUSD.address, ...new Array(6).fill(ZERO_ADDRESS)],
            routeParams: [
              [1, 0, 2 /*exchange_underlying*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: dai.address,
            swapTo: TUSD.address,
            inAmount,
            outAmount: expectOutAmount1.toFixed(0),
          },
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: TUSD.address,
            swapTo: TUSD_FRAXBP_LP.address,
            inAmount: expectOutAmount1.toFixed(0),
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: TUSD_FRAXBP_LP.address,
            swapTo: TUSD.address,
            inAmount: 0,
            outAmount: 0,
          },
          {
            routes: [TUSD.address, TUSD3CRV_POOL, dai.address, ...new Array(6).fill(ZERO_ADDRESS)],
            routeParams: [
              [0, 1, 2 /*exchange_underlying*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 1,
            swapFrom: TUSD.address,
            swapTo: dai.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
        ] as any,
        pathLength: 2,
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
      const collateralETHAmount = await calcETHAmount(testEnv, TUSD_FRAXBP_LP.address, LPAmount);

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
  describe('repay():', async () => {
    it('USDT', async () => {
      const { users, usdt, TUSD_FRAXBP_LP, pool, helpersContract } = testEnv;
      const borrower = users[1];

      let balance = await TUSD_FRAXBP_LP.balanceOf(borrower.address);
      expect(balance).to.be.bignumber.equal('0');

      // calculate borrowed amount
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      const borrowedAmount = await varDebtToken.balanceOf(borrower.address);

      // prepare stable asset
      await mint('USDT', borrowedAmount.toString(), borrower, testEnv);
      await usdt.connect(borrower.signer).approve(pool.address, borrowedAmount);

      // repay
      await expect(
        pool
          .connect(borrower.signer)
          .repay(usdt.address, borrowedAmount, RateMode.Variable, borrower.address)
      ).to.not.be.reverted;
    });
  });
  describe('liquidation:', async () => {
    it('DAI', async () => {
      const { users, dai, TUSD_FRAXBP_LP, pool, helpersContract, aCVXTUSD_FRAXBP, cvxtusd_fraxbp } =
        testEnv;
      const borrower = users[3];
      const liquidator = users[4];

      // check aToken balance for liquidator, borrower
      const borrowerAtokenBalance = await aCVXTUSD_FRAXBP.balanceOf(borrower.address);
      expect(borrowerAtokenBalance).to.be.bignumber.gt('0');

      // check debt
      const userReserveDataBefore = await getUserData(
        pool,
        helpersContract,
        dai.address,
        borrower.address
      );
      expect(userReserveDataBefore.currentVariableDebt.toString()).to.be.bignumber.gt('0');

      // drop liquidation threshold
      const configurator = await getLendingPoolConfiguratorProxy();
      await configurator.configureReserveAsCollateral(
        cvxtusd_fraxbp.address,
        '3000',
        '3200',
        '10200'
      );

      const userGlobalData = await pool.getUserAccountData(borrower.address);
      expect(userGlobalData.healthFactor.toString()).to.be.bignumber.lt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      // liquidation
      const amountToLiquidate = new BigNumber(userReserveDataBefore.currentVariableDebt.toString())
        .div(2)
        .toFixed(0);
      mint('DAI', amountToLiquidate, liquidator, testEnv);
      await dai.connect(liquidator.signer).approve(pool.address, amountToLiquidate);
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidationCall(
            TUSD_FRAXBP_LP.address,
            dai.address,
            borrower.address,
            amountToLiquidate,
            false
          )
      ).to.not.be.reverted;

      const userReserveDataAfter = await getUserData(
        pool,
        helpersContract,
        dai.address,
        borrower.address
      );

      expect(userReserveDataAfter.currentVariableDebt.toString()).to.be.bignumber.lt(
        userReserveDataBefore.currentVariableDebt.toString(),
        'Invalid user borrow balance after liquidation'
      );
    });
  });
});
