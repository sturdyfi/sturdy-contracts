import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { ZERO_ADDRESS, oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals, convertToCurrencyUnits } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { mint } from './helpers/mint';
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import { ICurvePool__factory, MintableERC20 } from '../../types';
import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';
import { IGeneralLevSwap__factory } from '../../types';
import { IGeneralLevSwap } from '../../types';

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
      .multipliedBy(1.5) // make enough amount
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

const calcETHAmount = async (testEnv: TestEnv, asset: tEthereumAddress, amount: BigNumberish) => {
  const { oracle } = testEnv;
  const assetPrice = await oracle.getAssetPrice(asset);
  const ethAmount = new BigNumber(amount.toString()).multipliedBy(assetPrice.toString()).toFixed(0);

  return ethAmount;
};

makeSuite('SUSD Zap Deposit', (testEnv) => {
  const LPAmount = '1000';
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
  describe('configuration', () => {
    it('DAI, USDC, USDT should be available for borrowing.', async () => {
      const { dai, usdc, usdt } = testEnv;
      const coins = (await susdLevSwap.getAvailableBorrowAssets()).map((coin) =>
        coin.toUpperCase()
      );
      expect(coins.length).to.be.equal(3);
      expect(coins.includes(dai.address.toUpperCase())).to.be.equal(true);
      expect(coins.includes(usdc.address.toUpperCase())).to.be.equal(true);
      expect(coins.includes(usdt.address.toUpperCase())).to.be.equal(true);
    });
  });
  describe('zapDeposit(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { dai } = testEnv;
      const principalAmount = 0;
      const stableCoin = dai.address;
      const paths = [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any;
      await expect(
        susdLevSwap.zapDeposit(stableCoin, principalAmount, paths, 0)
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { aDai } = testEnv;
      const principalAmount = 10;
      const stableCoin = aDai.address;
      const paths = [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any;
      await expect(
        susdLevSwap.zapDeposit(stableCoin, principalAmount, paths, 0)
      ).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, dai } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(dai.address, '1000');
      const stableCoin = dai.address;
      const paths = [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any;
      await expect(
        susdLevSwap.connect(borrower.signer).zapDeposit(stableCoin, principalAmount, paths, 0)
      ).to.be.revertedWith('115');
    });
  });
  describe('zapDeposit():', async () => {
    it('zap into LP vault with USDT', async () => {
      const {
        users,
        usdt,
        cvxdai_usdc_usdt_susd,
        convexDAIUSDCUSDTSUSDVault,
        aCVXDAI_USDC_USDT_SUSD,
        DAI_USDC_USDT_SUSD_LP,
        vaultWhitelist,
        owner,
      } = testEnv;

      const borrower = users[1];
      const principalAmount = (await convertToCurrencyDecimals(usdt.address, LPAmount)).toString();

      // Prepare Collateral
      await mint('USDT', principalAmount, borrower);
      await usdt.connect(borrower.signer).approve(susdLevSwap.address, principalAmount);

      // leverage
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, principalAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const paths = [
        {
          routes: new Array(9).fill(ZERO_ADDRESS),
          routeParams: new Array(4).fill([0, 0, 0]) as any,
          swapType: 1, //NO_SWAP: Join/Exit pool
          poolCount: 0,
          swapFrom: usdt.address,
          swapTo: DAI_USDC_USDT_SUSD_LP.address,
          inAmount: principalAmount,
          outAmount: expectOutAmount.multipliedBy(1 - slippage).toFixed(0),
        },
        MultiSwapPathInitData,
        MultiSwapPathInitData,
      ] as any;
      await expect(
        susdLevSwap.connect(borrower.signer).zapDeposit(usdt.address, principalAmount, paths, 1)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
        .connect(borrower.signer)
        .zapDeposit(usdt.address, principalAmount, paths, 1);

      expect(await usdt.balanceOf(borrower.address)).to.be.equal(0);
      expect(await cvxdai_usdc_usdt_susd.balanceOf(convexDAIUSDCUSDTSUSDVault.address)).to.be.equal(
        0
      );
      expect(
        await aCVXDAI_USDC_USDT_SUSD.balanceOf(convexDAIUSDCUSDTSUSDVault.address)
      ).to.be.equal(0);
      const afterBalanceOfBorrower = await aCVXDAI_USDC_USDT_SUSD.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '97'
      );
    });
  });
});

makeSuite('SUSD Zap Leverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';

  /// LTV = 0.8, slippage = 0.02, Aave fee = 0.0009
  /// leverage / (1 + leverage) <= LTV / (1 + slippage) / (1 + Aave fee)
  /// leverage / (1 + leverage) <= 0.8 / 1.02 / 1.0009 = 0.7836084
  /// leverage <= 0.7836084 / (1 - 0.7836084) = 3.62125
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
  describe('configuration', () => {
    it('DAI, USDC, USDT should be available for borrowing.', async () => {
      const { dai, usdc, usdt } = testEnv;
      const coins = (await susdLevSwap.getAvailableBorrowAssets()).map((coin) =>
        coin.toUpperCase()
      );
      expect(coins.length).to.be.equal(3);
      expect(coins.includes(dai.address.toUpperCase())).to.be.equal(true);
      expect(coins.includes(usdc.address.toUpperCase())).to.be.equal(true);
      expect(coins.includes(usdt.address.toUpperCase())).to.be.equal(true);
    });
  });
  describe('zapLeverageWithFlashloan(): Prerequisite checker', () => {
    it('should be reverted if try to use zero amount', async () => {
      const { dai } = testEnv;
      const principalAmount = 0;
      const stableCoin = dai.address;
      const paths = [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any;
      const swapInfo = {
        paths,
        reversePaths: paths,
        pathLength: 0,
      };

      await expect(
        susdLevSwap.zapLeverageWithFlashloan(
          stableCoin,
          principalAmount,
          leverage,
          stableCoin,
          0,
          paths,
          0,
          swapInfo
        )
      ).to.be.revertedWith('113');
    });
    it('should be reverted if try to use invalid stable coin', async () => {
      const { dai, aDai } = testEnv;
      const principalAmount = 10;
      const stableCoin = aDai.address;
      const paths = [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any;
      const swapInfo = {
        paths,
        reversePaths: paths,
        pathLength: 0,
      };

      await expect(
        susdLevSwap.zapLeverageWithFlashloan(
          stableCoin,
          principalAmount,
          leverage,
          dai.address,
          0,
          paths,
          0,
          swapInfo
        )
      ).to.be.revertedWith('114');
      await expect(
        susdLevSwap.zapLeverageWithFlashloan(
          dai.address,
          principalAmount,
          leverage,
          stableCoin,
          0,
          paths,
          0,
          swapInfo
        )
      ).to.be.revertedWith('114');
    });
    it('should be reverted when collateral is not enough', async () => {
      const { users, dai } = testEnv;
      const borrower = users[1];
      const principalAmount = await convertToCurrencyDecimals(dai.address, '1000');
      const stableCoin = dai.address;
      const paths = [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any;
      const swapInfo = {
        paths,
        reversePaths: paths,
        pathLength: 0,
      };
      await expect(
        susdLevSwap
          .connect(borrower.signer)
          .zapLeverageWithFlashloan(
            dai.address,
            principalAmount,
            leverage,
            stableCoin,
            0,
            paths,
            0,
            swapInfo
          )
      ).to.be.revertedWith('115');
    });
  });
  describe('zapLeverageWithFlashloan():', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        pool,
        helpersContract,
        DAI_USDC_USDT_SUSD_LP,
        vaultWhitelist,
        convexDAIUSDCUSDTSUSDVault,
        owner,
      } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (await convertToCurrencyDecimals(usdt.address, LPAmount)).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          DAI_USDC_USDT_SUSD_LP.address,
          LPAmount,
          ltv,
          leverage / 10000,
          usdt.address
        )
      ).toString();

      // Deposit USDT to Lending Pool
      await mint('USDT', amountToDelegate, depositor);
      await depositToLendingPool(usdt, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('USDT', principalAmount, borrower);
      await usdt.connect(borrower.signer).approve(susdLevSwap.address, principalAmount);

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
      const expectZapOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, principalAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const zapPaths = [
        {
          routes: new Array(9).fill(ZERO_ADDRESS),
          routeParams: new Array(4).fill([0, 0, 0]) as any,
          swapType: 1, //NO_SWAP: Join/Exit pool
          poolCount: 0,
          swapFrom: usdt.address,
          swapTo: DAI_USDC_USDT_SUSD_LP.address,
          inAmount: principalAmount,
          outAmount: expectZapOutAmount.multipliedBy(1 - slippage).toFixed(0),
        },
        MultiSwapPathInitData,
        MultiSwapPathInitData,
      ] as any;
      const inAmount = (
        await calcInAmount(
          testEnv,
          await convertToCurrencyUnits(
            DAI_USDC_USDT_SUSD_LP.address,
            expectZapOutAmount.toString()
          ),
          leverage,
          usdt.address
        )
      ).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, 2, inAmount, 4, true, true, SUSD_POOL)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: new Array(9).fill(ZERO_ADDRESS),
            routeParams: new Array(4).fill([0, 0, 0]) as any,
            swapType: 1, //NO_SWAP: Join/Exit pool
            poolCount: 0,
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
          .zapLeverageWithFlashloan(
            usdt.address,
            principalAmount,
            leverage,
            usdt.address,
            0,
            zapPaths,
            1,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(convexDAIUSDCUSDTSUSDVault.address, borrower.address);
      await susdLevSwap
        .connect(borrower.signer)
        .zapLeverageWithFlashloan(
          usdt.address,
          principalAmount,
          leverage,
          usdt.address,
          0,
          zapPaths,
          1,
          swapInfo
        );

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
      const collateralETHAmount = await calcETHAmount(testEnv, usdt.address, LPAmount);

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
});
