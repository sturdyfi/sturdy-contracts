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
import { IGeneralLevSwap2__factory } from '../../types';
import { IGeneralLevSwap2 } from '../../types';

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
  return IGeneralLevSwap2__factory.connect(levSwapAddress, deployer.signer);
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

makeSuite('MIM3CRV Leverage Swap', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';

  /// LTV = 0.8, slippage = 0.02, Aave fee = 0.0009
  /// leverage / (1 + leverage) <= LTV / (1 + slippage) / (1 + Aave fee)
  /// leverage / (1 + leverage) <= 0.8 / 1.02 / 1.0009 = 0.7836084
  /// leverage <= 0.7836084 / (1 - 0.7836084) = 3.62125
  const leverage = 36000;
  let mim3crvLevSwap = {} as IGeneralLevSwap2;
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
  describe('configuration', () => {
    it('DAI, USDC, USDT should be available for borrowing.', async () => {
      const { dai, usdc, usdt } = testEnv;
      const coins = (await mim3crvLevSwap.getAvailableBorrowAssets()).map((coin) =>
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
        mim3crvLevSwap.enterPositionWithFlashloan(
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
        mim3crvLevSwap.enterPositionWithFlashloan(
          principalAmount,
          leverage,
          stableCoin,
          0,
          swapInfo
        )
      ).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, dai, MIM_3CRV_LP } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(MIM_3CRV_LP.address, '1000');
      const stableCoin = dai.address;
      const swapInfo = {
        paths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
        reversePaths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
        pathLength: 0,
      };
      await expect(
        mim3crvLevSwap
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
      const collateralETHAmount = await calcETHAmount(testEnv, MIM_3CRV_LP.address, LPAmount);

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
        MIM_3CRV_LP,
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
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
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
      const collateralETHAmount = await calcETHAmount(testEnv, MIM_3CRV_LP.address, LPAmount);

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
        MIM_3CRV_LP,
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
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
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
      const collateralETHAmount = await calcETHAmount(testEnv, MIM_3CRV_LP.address, LPAmount);

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
      const { users, usdt, MIM_3CRV_LP, pool, helpersContract } = testEnv;
      const borrower = users[1];

      let balance = await MIM_3CRV_LP.balanceOf(borrower.address);
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
      const { users, dai, MIM_3CRV_LP, pool, helpersContract, aCVXMIM_3CRV, cvxmim_3crv } = testEnv;
      const borrower = users[3];
      const liquidator = users[4];

      // check aToken balance for liquidator, borrower
      const borrowerAtokenBalance = await aCVXMIM_3CRV.balanceOf(borrower.address);
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
      await configurator.configureReserveAsCollateral(cvxmim_3crv.address, '3000', '3200', '10200');

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
            MIM_3CRV_LP.address,
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
