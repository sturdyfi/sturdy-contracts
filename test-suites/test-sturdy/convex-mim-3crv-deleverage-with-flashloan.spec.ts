import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { oneEther, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals, convertToCurrencyUnits } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import { ICurvePool__factory, MintableERC20, MintableERC20__factory } from '../../types';
import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';
import { IGeneralLevSwap__factory } from '../../types';
import { IGeneralLevSwap } from '../../types';

const chai = require('chai');
const { expect } = chai;

const slippage = 0.0002; //0.02%
const THREE_CRV_LP = '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490';
const THREE_CRV_POOL = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7';
const MIM3CRV_POOL = '0x5a6A4D54456819380173272A5E8E9B9904BdF41B';
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
  const { usdc, dai, usdt, MIM_3CRV_LP } = testEnv;
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
  } else if (reserveSymbol == 'MIM_3CRV_LP') {
    ownerAddress = '0xe896e539e557BC751860a7763C8dD589aF1698Ce';
    token = MIM_3CRV_LP;
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

const calcThreeCRVPrice = async (testEnv: TestEnv) => {
  const { deployer, oracle, dai, usdc, usdt } = testEnv;
  const threeCRVPool = ICurvePool__factory.connect(THREE_CRV_POOL, deployer.signer);
  const threeCRVLP = MintableERC20__factory.connect(THREE_CRV_LP, deployer.signer);
  const daiPrice = await oracle.getAssetPrice(dai.address);
  const daiTotalBalance = await threeCRVPool['balances(uint256)'](0);
  const usdcPrice = await oracle.getAssetPrice(usdc.address);
  const usdcTotalBalance = await threeCRVPool['balances(uint256)'](1);
  const usdtPrice = await oracle.getAssetPrice(usdt.address);
  const usdtTotalBalance = await threeCRVPool['balances(uint256)'](2);
  const threeCRVLpTotalSupply = await threeCRVLP.totalSupply();

  return new BigNumber(daiPrice.toString())
    .multipliedBy(daiTotalBalance.toString())
    .dividedBy(1e18)
    .plus(
      new BigNumber(usdcPrice.toString()).multipliedBy(usdcTotalBalance.toString()).dividedBy(1e6)
    )
    .plus(
      new BigNumber(usdtPrice.toString()).multipliedBy(usdtTotalBalance.toString()).dividedBy(1e6)
    )
    .multipliedBy(1e18)
    .dividedBy(threeCRVLpTotalSupply.toString());
};

const calcCollateralPrice = async (testEnv: TestEnv) => {
  const { deployer, oracle, MIM, MIM_3CRV_LP } = testEnv;
  const MIM3CRVPool = ICurvePool__factory.connect(MIM3CRV_POOL, deployer.signer);
  const mimPrice = await oracle.getAssetPrice(MIM.address);
  const mimTotalBalance = await MIM3CRVPool['balances(uint256)'](0);
  const threeCRVPrice = await calcThreeCRVPrice(testEnv);
  const threeCRVTotalBalance = await MIM3CRVPool['balances(uint256)'](1);
  const lpTotalSupply = await MIM_3CRV_LP.totalSupply();

  return new BigNumber(mimPrice.toString())
    .multipliedBy(mimTotalBalance.toString())
    .plus(new BigNumber(threeCRVPrice.toString()).multipliedBy(threeCRVTotalBalance.toString()))
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
      .div(1 - 0.015) // flashloan fee + extra(swap loss) = 1.5%
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
    return await curvePool['calc_token_amount(uint256[3],bool)'](amounts as any, isDeposit);
  }

  return await curvePool['calc_withdraw_one_coin(uint256,int128)'](amount, fromIndex);
};

makeSuite('MIM3CRV Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const leverage = 36000;
  let mim3crvLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxmim_3crv, vaultWhitelist, convexMIM3CRVVault, users, owner } =
      testEnv;
    mim3crvLevSwap = await getCollateralLevSwapper(testEnv, cvxmim_3crv.address);
    ltv = (await helpersContract.getReserveConfigurationData(cvxmim_3crv.address)).ltv.toString();
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexMIM3CRVVault.address, mim3crvLevSwap.address);
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistUser(convexMIM3CRVVault.address, users[0].address);
  });
  describe('leavePosition - full amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        aCVXMIM_3CRV,
        MIM_3CRV_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexMIM3CRVVault,
        owner,
      } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(MIM_3CRV_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          MIM_3CRV_LP.address,
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
      await mint('MIM_3CRV_LP', principalAmount, borrower, testEnv);
      await MIM_3CRV_LP.connect(borrower.signer).approve(mim3crvLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(mim3crvLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, inAmount, 3, true, true, THREE_CRV_POOL)).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            expectOutAmount1.toFixed(0),
            2,
            true,
            true,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              THREE_CRV_POOL,
              THREE_CRV_LP,
              MIM3CRV_POOL,
              MIM_3CRV_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [2, 0, 8 /*3-coin-pool add_liquidity*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: usdt.address,
            swapTo: MIM_3CRV_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              MIM_3CRV_LP.address,
              MIM3CRV_POOL,
              THREE_CRV_LP,
              THREE_CRV_POOL,
              usdt.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 2, 12 /*3-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: MIM_3CRV_LP.address,
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
        mim3crvLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexMIM3CRVVault.address, borrower.address);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount,
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        usdt.address
      );
      const reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            2,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          usdt.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
    it('USDC as borrowing asset', async () => {
      const {
        users,
        usdc,
        MIM_3CRV_LP,
        aCVXMIM_3CRV,
        pool,
        helpersContract,
        vaultWhitelist,
        convexMIM3CRVVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(MIM_3CRV_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          MIM_3CRV_LP.address,
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
      await mint('MIM_3CRV_LP', principalAmount, borrower, testEnv);
      await MIM_3CRV_LP.connect(borrower.signer).approve(mim3crvLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(mim3crvLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (await calcMinAmountOut(testEnv, 1, inAmount, 3, true, true, THREE_CRV_POOL)).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            expectOutAmount1.toFixed(0),
            2,
            true,
            true,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              THREE_CRV_POOL,
              THREE_CRV_LP,
              MIM3CRV_POOL,
              MIM_3CRV_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 8 /*3-coin-pool add_liquidity*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: usdc.address,
            swapTo: MIM_3CRV_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              MIM_3CRV_LP.address,
              MIM3CRV_POOL,
              THREE_CRV_LP,
              THREE_CRV_POOL,
              usdc.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 1, 12 /*3-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: MIM_3CRV_LP.address,
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
        mim3crvLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexMIM3CRVVault.address, borrower.address);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount,
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        usdc.address
      );
      const reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          usdc.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
    it('DAI as borrowing asset', async () => {
      const {
        users,
        dai,
        MIM_3CRV_LP,
        aCVXMIM_3CRV,
        pool,
        helpersContract,
        vaultWhitelist,
        convexMIM3CRVVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(MIM_3CRV_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          MIM_3CRV_LP.address,
          LPAmount,
          ltv,
          leverage,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('MIM_3CRV_LP', principalAmount, borrower, testEnv);
      await MIM_3CRV_LP.connect(borrower.signer).approve(mim3crvLevSwap.address, principalAmount);

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(mim3crvLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, inAmount, 3, true, true, THREE_CRV_POOL)).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            expectOutAmount1.toFixed(0),
            2,
            true,
            true,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              THREE_CRV_POOL,
              THREE_CRV_LP,
              MIM3CRV_POOL,
              MIM_3CRV_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 0, 8 /*3-coin-pool add_liquidity*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: dai.address,
            swapTo: MIM_3CRV_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              MIM_3CRV_LP.address,
              MIM3CRV_POOL,
              THREE_CRV_LP,
              THREE_CRV_POOL,
              dai.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 12 /*3-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: MIM_3CRV_LP.address,
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
        mim3crvLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexMIM3CRVVault.address, borrower.address);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount,
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        dai.address
      );
      const reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          dai.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
  });
});

makeSuite('MIM3CRV Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage2 = '70'; //0.7%
  const leverage = 36000;
  let mim3crvLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, cvxmim_3crv, vaultWhitelist, convexMIM3CRVVault, users, owner } =
      testEnv;
    mim3crvLevSwap = await getCollateralLevSwapper(testEnv, cvxmim_3crv.address);
    ltv = (await helpersContract.getReserveConfigurationData(cvxmim_3crv.address)).ltv.toString();
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexMIM3CRVVault.address, mim3crvLevSwap.address);
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistUser(convexMIM3CRVVault.address, users[0].address);
  });
  describe('leavePosition - partial amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        aCVXMIM_3CRV,
        MIM_3CRV_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        convexMIM3CRVVault,
        owner,
      } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(MIM_3CRV_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          MIM_3CRV_LP.address,
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
      await mint('MIM_3CRV_LP', principalAmount, borrower, testEnv);
      await MIM_3CRV_LP.connect(borrower.signer).approve(mim3crvLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(mim3crvLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, inAmount, 3, true, true, THREE_CRV_POOL)).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            expectOutAmount1.toFixed(0),
            2,
            true,
            true,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              THREE_CRV_POOL,
              THREE_CRV_LP,
              MIM3CRV_POOL,
              MIM_3CRV_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [2, 0, 8 /*3-coin-pool add_liquidity*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: usdt.address,
            swapTo: MIM_3CRV_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              MIM_3CRV_LP.address,
              MIM3CRV_POOL,
              THREE_CRV_LP,
              THREE_CRV_POOL,
              usdt.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 2, 12 /*3-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: MIM_3CRV_LP.address,
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
        mim3crvLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexMIM3CRVVault.address, borrower.address);
      await mim3crvLevSwap
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

      const beforeBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        usdt.address
      );
      let reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      let reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            2,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          usdt.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        usdt.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            2,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          usdt.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        usdt.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            2,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          usdt.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        usdt.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            2,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          usdt.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
        MIM_3CRV_LP,
        aCVXMIM_3CRV,
        pool,
        helpersContract,
        vaultWhitelist,
        convexMIM3CRVVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(MIM_3CRV_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          MIM_3CRV_LP.address,
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
      await mint('MIM_3CRV_LP', principalAmount, borrower, testEnv);
      await MIM_3CRV_LP.connect(borrower.signer).approve(mim3crvLevSwap.address, principalAmount);

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(mim3crvLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (await calcMinAmountOut(testEnv, 1, inAmount, 3, true, true, THREE_CRV_POOL)).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            expectOutAmount1.toFixed(0),
            2,
            true,
            true,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              THREE_CRV_POOL,
              THREE_CRV_LP,
              MIM3CRV_POOL,
              MIM_3CRV_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [1, 0, 8 /*3-coin-pool add_liquidity*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: usdc.address,
            swapTo: MIM_3CRV_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              MIM_3CRV_LP.address,
              MIM3CRV_POOL,
              THREE_CRV_LP,
              THREE_CRV_POOL,
              usdc.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 1, 12 /*3-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: MIM_3CRV_LP.address,
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
        mim3crvLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexMIM3CRVVault.address, borrower.address);
      await mim3crvLevSwap
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

      const beforeBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        usdc.address
      );
      let reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      let reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          usdc.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        usdc.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          usdc.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        usdc.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          usdc.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        usdc.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          usdc.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
        MIM_3CRV_LP,
        aCVXMIM_3CRV,
        pool,
        helpersContract,
        vaultWhitelist,
        convexMIM3CRVVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(MIM_3CRV_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          MIM_3CRV_LP.address,
          LPAmount,
          ltv,
          leverage,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('MIM_3CRV_LP', principalAmount, borrower, testEnv);
      await MIM_3CRV_LP.connect(borrower.signer).approve(mim3crvLevSwap.address, principalAmount);

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(mim3crvLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount1 = new BigNumber(
        (await calcMinAmountOut(testEnv, 0, inAmount, 3, true, true, THREE_CRV_POOL)).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            expectOutAmount1.toFixed(0),
            2,
            true,
            true,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              THREE_CRV_POOL,
              THREE_CRV_LP,
              MIM3CRV_POOL,
              MIM_3CRV_LP.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 0, 8 /*3-coin-pool add_liquidity*/],
              [1, 0, 7 /*2-coin-pool add_liquidity*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, // curve
            poolCount: 2,
            swapFrom: dai.address,
            swapTo: MIM_3CRV_LP.address,
            inAmount,
            outAmount: expectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              MIM_3CRV_LP.address,
              MIM3CRV_POOL,
              THREE_CRV_LP,
              THREE_CRV_POOL,
              dai.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 12 /*3-coin-pool remove_liquidity_one_coin*/],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 4, //Curve
            poolCount: 2,
            swapFrom: MIM_3CRV_LP.address,
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
        mim3crvLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexMIM3CRVVault.address, borrower.address);
      await mim3crvLevSwap
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

      const beforeBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        dai.address
      );
      let reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      let reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          dai.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        dai.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          dai.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        dai.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          dai.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aCVXMIM_3CRV.balanceOf(borrower.address);
      await aCVXMIM_3CRV
        .connect(borrower.signer)
        .approve(mim3crvLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        MIM_3CRV_LP.address,
        dai.address
      );
      reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            reverseInAmount.toFixed(0),
            0,
            false,
            false,
            MIM3CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            reverseExpectOutAmount1.toFixed(0),
            0,
            false,
            false,
            THREE_CRV_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount2.toFixed(0);
      await mim3crvLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          dai.address,
          aCVXMIM_3CRV.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await MIM_3CRV_LP.balanceOf(borrower.address);
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
