import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { oneEther, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
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
const SUSD_POOL = '0xA5407eAE9Ba41422680e2e00537571bcC53efBfD';
const SUSD = '0x57Ab1ec28D129707052df4dF418D58a2D46d5f51';
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
  const { usdc, dai, usdt, DAI_USDC_USDT_SUSD_LP } = testEnv;
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
  } else if (reserveSymbol == 'DAI_USDC_USDT_SUSD_LP') {
    ownerAddress = '0x9E51BE7071F086d3A1fD5Dc0016177473619b237';
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

const calcCollateralPrice = async (testEnv: TestEnv) => {
  const { deployer, oracle, dai, usdc, usdt, DAI_USDC_USDT_SUSD_LP } = testEnv;

  const curvePool = ICurvePool__factory.connect(SUSD_POOL, deployer.signer);
  const daiPrice = await oracle.getAssetPrice(dai.address);
  const daiTotalBalance = await curvePool['balances(int128)'](0);
  const usdcPrice = await oracle.getAssetPrice(usdc.address);
  const usdcTotalBalance = await curvePool['balances(int128)'](1);
  const usdtPrice = await oracle.getAssetPrice(usdt.address);
  const usdtTotalBalance = await curvePool['balances(int128)'](2);
  const susdPrice = await oracle.getAssetPrice(SUSD);
  const susdTotalBalance = await curvePool['balances(int128)'](3);
  const lpTotalSupply = await DAI_USDC_USDT_SUSD_LP.totalSupply();

  return new BigNumber(daiPrice.toString())
    .multipliedBy(daiTotalBalance.toString())
    .dividedBy(1e18)
    .plus(
      new BigNumber(usdcPrice.toString()).multipliedBy(usdcTotalBalance.toString()).dividedBy(1e6)
    )
    .plus(
      new BigNumber(usdtPrice.toString()).multipliedBy(usdtTotalBalance.toString()).dividedBy(1e6)
    )
    .plus(
      new BigNumber(susdPrice.toString()).multipliedBy(susdTotalBalance.toString()).dividedBy(1e18)
    )
    .multipliedBy(1e18)
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
      .div(1 - 0.006) // flashloan fee + extra(swap loss) = 0.6%
      .toFixed(0)
  );

  return intputAmount;
};

const calcMinAmountOut = async (
  testEnv: TestEnv,
  fromIndex: number,
  amount: BigNumberish,
  poolCoinsLength: number,
  isDeposit: boolean,
  isCalcTokenAmount: boolean,
  pool: tEthereumAddress
) => {
  const { deployer } = testEnv;

  const curvePool = ICurvePool__factory.connect(pool, deployer.signer);
  if (isCalcTokenAmount) {
    const amounts = new Array<BigNumberish>(poolCoinsLength).fill('0');
    amounts[fromIndex] = amount;

    if (poolCoinsLength == 2)
      return await curvePool['calc_token_amount(uint256[2],bool)'](amounts as any, isDeposit);
    return await curvePool['calc_token_amount(uint256[4],bool)'](amounts as any, isDeposit);
  }

  return await curvePool['calc_withdraw_one_coin(uint256,int128)'](amount, fromIndex);
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

makeSuite('SUSD Deleverage with AAVE Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const leverage = 36000;
  let susdLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const {
      helpersContract,
      cvxdai_usdc_usdt_susd,
      vaultWhitelist,
      convexDAIUSDCUSDTSUSDVault,
      users,
      owner,
    } = testEnv;
    susdLevSwap = await getCollateralLevSwapper(testEnv, cvxdai_usdc_usdt_susd.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxdai_usdc_usdt_susd.address)
    ).ltv.toString();
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexDAIUSDCUSDTSUSDVault.address, susdLevSwap.address);
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, users[0].address);
  });
  describe('leavePosition - full amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        aCVXDAI_USDC_USDT_SUSD,
        DAI_USDC_USDT_SUSD_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexDAIUSDCUSDTSUSDVault,
        owner,
      } = testEnv;

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
          leverage,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, inAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              SUSD_POOL,
              DAI_USDC_USDT_SUSD_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [2, 0, 10 /*4-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: usdt.address,
            swapTo: DAI_USDC_USDT_SUSD_LP.address,
            inAmount,
            outAmount: expectOutAmount.multipliedBy(1 - slippage).toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: DAI_USDC_USDT_SUSD_LP.address,
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
        susdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const outAmount = new BigNumber(repayAmount.toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      const expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount,
          principalAmount,
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
    it('USDC as borrowing asset', async () => {
      const {
        users,
        usdc,
        DAI_USDC_USDT_SUSD_LP,
        aCVXDAI_USDC_USDT_SUSD,
        pool,
        helpersContract,
        vaultWhitelist,
        convexDAIUSDCUSDTSUSDVault,
        owner,
      } = testEnv;
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
          leverage,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 1, inAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              SUSD_POOL,
              DAI_USDC_USDT_SUSD_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 10 /*4-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: usdc.address,
            swapTo: DAI_USDC_USDT_SUSD_LP.address,
            inAmount,
            outAmount: expectOutAmount.multipliedBy(1 - slippage).toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: DAI_USDC_USDT_SUSD_LP.address,
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
        susdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const outAmount = new BigNumber(repayAmount.toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      const expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 1, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount,
          principalAmount,
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
    it('DAI as borrowing asset', async () => {
      const {
        users,
        dai,
        DAI_USDC_USDT_SUSD_LP,
        aCVXDAI_USDC_USDT_SUSD,
        pool,
        helpersContract,
        vaultWhitelist,
        convexDAIUSDCUSDTSUSDVault,
        owner,
      } = testEnv;
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
          leverage,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, inAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              SUSD_POOL,
              DAI_USDC_USDT_SUSD_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 0, 10 /*4-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: dai.address,
            swapTo: DAI_USDC_USDT_SUSD_LP.address,
            inAmount,
            outAmount: expectOutAmount.multipliedBy(1 - slippage).toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: DAI_USDC_USDT_SUSD_LP.address,
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
        susdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const outAmount = new BigNumber(repayAmount.toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      const expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount,
          principalAmount,
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
  });
});

makeSuite('SUSD Deleverage with Balancer Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const leverage = 36000;
  let susdLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const {
      helpersContract,
      cvxdai_usdc_usdt_susd,
      vaultWhitelist,
      convexDAIUSDCUSDTSUSDVault,
      users,
      owner,
    } = testEnv;
    susdLevSwap = await getCollateralLevSwapper(testEnv, cvxdai_usdc_usdt_susd.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxdai_usdc_usdt_susd.address)
    ).ltv.toString();
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexDAIUSDCUSDTSUSDVault.address, susdLevSwap.address);
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, users[0].address);
  });
  describe('leavePosition - full amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        aCVXDAI_USDC_USDT_SUSD,
        DAI_USDC_USDT_SUSD_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexDAIUSDCUSDTSUSDVault,
        owner,
      } = testEnv;

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
          leverage,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, inAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              SUSD_POOL,
              DAI_USDC_USDT_SUSD_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [2, 0, 10 /*4-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: usdt.address,
            swapTo: DAI_USDC_USDT_SUSD_LP.address,
            inAmount,
            outAmount: expectOutAmount.multipliedBy(1 - slippage).toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: DAI_USDC_USDT_SUSD_LP.address,
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
        susdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const outAmount = new BigNumber(repayAmount.toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      const expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount,
          principalAmount,
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          1,
          swapInfo
        );

      const afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
    it('USDC as borrowing asset', async () => {
      const {
        users,
        usdc,
        DAI_USDC_USDT_SUSD_LP,
        aCVXDAI_USDC_USDT_SUSD,
        pool,
        helpersContract,
        vaultWhitelist,
        convexDAIUSDCUSDTSUSDVault,
        owner,
      } = testEnv;
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
          leverage,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 1, inAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              SUSD_POOL,
              DAI_USDC_USDT_SUSD_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 10 /*4-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: usdc.address,
            swapTo: DAI_USDC_USDT_SUSD_LP.address,
            inAmount,
            outAmount: expectOutAmount.multipliedBy(1 - slippage).toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: DAI_USDC_USDT_SUSD_LP.address,
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
        susdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const outAmount = new BigNumber(repayAmount.toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      const expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 1, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount,
          principalAmount,
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          1,
          swapInfo
        );

      const afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
    it('DAI as borrowing asset', async () => {
      const {
        users,
        dai,
        DAI_USDC_USDT_SUSD_LP,
        aCVXDAI_USDC_USDT_SUSD,
        pool,
        helpersContract,
        vaultWhitelist,
        convexDAIUSDCUSDTSUSDVault,
        owner,
      } = testEnv;
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
          leverage,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, inAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              SUSD_POOL,
              DAI_USDC_USDT_SUSD_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 0, 10 /*4-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: dai.address,
            swapTo: DAI_USDC_USDT_SUSD_LP.address,
            inAmount,
            outAmount: expectOutAmount.multipliedBy(1 - slippage).toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: DAI_USDC_USDT_SUSD_LP.address,
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
        susdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo);

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

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const outAmount = new BigNumber(repayAmount.toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      const expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount,
          principalAmount,
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          1,
          swapInfo
        );

      const afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
  });
});

makeSuite('SUSD Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const leverage = 36000;
  let susdLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const {
      helpersContract,
      cvxdai_usdc_usdt_susd,
      vaultWhitelist,
      convexDAIUSDCUSDTSUSDVault,
      users,
      owner,
    } = testEnv;
    susdLevSwap = await getCollateralLevSwapper(testEnv, cvxdai_usdc_usdt_susd.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxdai_usdc_usdt_susd.address)
    ).ltv.toString();
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexDAIUSDCUSDTSUSDVault.address, susdLevSwap.address);
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, users[0].address);
  });
  describe('leavePosition - partial amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        aCVXDAI_USDC_USDT_SUSD,
        DAI_USDC_USDT_SUSD_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexDAIUSDCUSDTSUSDVault,
        owner,
      } = testEnv;

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
          leverage,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, inAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              SUSD_POOL,
              DAI_USDC_USDT_SUSD_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [2, 0, 10 /*4-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: usdt.address,
            swapTo: DAI_USDC_USDT_SUSD_LP.address,
            inAmount,
            outAmount: expectOutAmount.multipliedBy(1 - slippage).toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: DAI_USDC_USDT_SUSD_LP.address,
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
        susdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
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

      const beforeBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let outAmount = new BigNumber(repayAmount.div(10).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      let expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      outAmount = new BigNumber(repayAmount.div(10).mul(2).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      outAmount = new BigNumber(repayAmount.div(10).mul(3).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      outAmount = new BigNumber(repayAmount.div(10).mul(4).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          usdt.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
    it('USDC as borrowing asset', async () => {
      const {
        users,
        usdc,
        DAI_USDC_USDT_SUSD_LP,
        aCVXDAI_USDC_USDT_SUSD,
        pool,
        helpersContract,
        vaultWhitelist,
        convexDAIUSDCUSDTSUSDVault,
        owner,
      } = testEnv;
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
          leverage,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 1, inAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              SUSD_POOL,
              DAI_USDC_USDT_SUSD_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 10 /*4-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: usdc.address,
            swapTo: DAI_USDC_USDT_SUSD_LP.address,
            inAmount,
            outAmount: expectOutAmount.multipliedBy(1 - slippage).toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: DAI_USDC_USDT_SUSD_LP.address,
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
        susdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
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

      const beforeBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let outAmount = new BigNumber(repayAmount.div(10).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      let expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      outAmount = new BigNumber(repayAmount.div(10).mul(2).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      outAmount = new BigNumber(repayAmount.div(10).mul(3).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      outAmount = new BigNumber(repayAmount.div(10).mul(4).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          usdc.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
        DAI_USDC_USDT_SUSD_LP,
        aCVXDAI_USDC_USDT_SUSD,
        pool,
        helpersContract,
        vaultWhitelist,
        convexDAIUSDCUSDTSUSDVault,
        owner,
      } = testEnv;
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
          leverage,
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
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, inAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              SUSD_POOL,
              DAI_USDC_USDT_SUSD_LP.address,
              ...new Array(6).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 0, 10 /*4-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 1,
            swapFrom: dai.address,
            swapTo: DAI_USDC_USDT_SUSD_LP.address,
            inAmount,
            outAmount: expectOutAmount.multipliedBy(1 - slippage).toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
            swapFrom: DAI_USDC_USDT_SUSD_LP.address,
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
        susdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
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

      const beforeBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let outAmount = new BigNumber(repayAmount.div(10).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      let expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      outAmount = new BigNumber(repayAmount.div(10).mul(2).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      outAmount = new BigNumber(repayAmount.div(10).mul(3).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      await aCVXDAI_USDC_USDT_SUSD
        .connect(borrower.signer)
        .approve(susdLevSwap.address, balanceInSturdy.mul(2));

      outAmount = new BigNumber(repayAmount.div(10).mul(4).toString())
        .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
        .plus(0.5)
        .dp(0, 1) //round down with decimal 0
        .toFixed(0);
      expectInAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, outAmount, 4, false, true, SUSD_POOL)).toString()
      );
      swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
      swapInfo.reversePaths[0].outAmount = outAmount;
      await susdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          dai.address,
          aCVXDAI_USDC_USDT_SUSD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await DAI_USDC_USDT_SUSD_LP.balanceOf(borrower.address);
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
  });
});
