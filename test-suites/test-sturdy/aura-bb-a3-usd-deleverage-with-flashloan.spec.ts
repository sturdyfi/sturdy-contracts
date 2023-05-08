import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { oneEther, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals, convertToCurrencyUnits } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import { MintableERC20, IGeneralLevSwap, IGeneralLevSwap__factory } from '../../types';
import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';

const chai = require('chai');
const { expect } = chai;

const slippage = 0.008; //0.8%
const BB_A3_USDT = '0xA1697F9Af0875B63DdC472d6EeBADa8C1fAB8568';
const BB_A3_USDT_POOLID = '0xa1697f9af0875b63ddc472d6eebada8c1fab85680000000000000000000004f9';
const BB_A3_USDC = '0xcbFA4532D8B2ade2C261D3DD5ef2A2284f792692';
const BB_A3_USDC_POOLID = '0xcbfa4532d8b2ade2c261d3dd5ef2a2284f7926920000000000000000000004fa';
const BB_A3_DAI = '0x6667c6fa9f2b3Fc1Cc8D85320b62703d938E4385';
const BB_A3_DAI_POOLID = '0x6667c6fa9f2b3fc1cc8d85320b62703d938e43850000000000000000000004fb';
const BB_A3_USD = '0xfeBb0bbf162E64fb9D0dfe186E517d84C395f016';
const BB_A3_USD_POOLID = '0xfebb0bbf162e64fb9d0dfe186e517d84c395f016000000000000000000000502';
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
  const { usdc, dai, usdt, BAL_BB_A3_USD_LP } = testEnv;
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
  } else if (reserveSymbol == 'BAL_BB_A3_USD_LP') {
    ownerAddress = '0x87839e0378c62d8962c76726cfdd932a97ef626a';
    token = BAL_BB_A3_USD_LP;
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

const calcInAmount = async (
  testEnv: TestEnv,
  amount: BigNumberish,
  leverage: BigNumberish,
  borrowingAsset: tEthereumAddress
) => {
  const { oracle, BAL_BB_A3_USD_LP } = testEnv;
  const collateralPrice = await oracle.getAssetPrice(BAL_BB_A3_USD_LP.address);
  const borrowingAssetPrice = await oracle.getAssetPrice(borrowingAsset);

  const intputAmount = await convertToCurrencyDecimals(
    borrowingAsset,
    new BigNumber(amount.toString())
      .multipliedBy(leverage.toString())
      .div(10000)
      .multipliedBy(collateralPrice.toString())
      .div(borrowingAssetPrice.toString())
      .div(1 - 0.008) // flashloan fee + extra(swap loss) = 0.8%
      .toFixed(0)
  );

  return intputAmount;
};

const calcMinAmountOut = async (
  testEnv: TestEnv,
  amount: BigNumberish,
  fromAsset: tEthereumAddress,
  toAsset: tEthereumAddress
) => {
  const { oracle } = testEnv;
  const fromAssetPrice = await oracle.getAssetPrice(fromAsset);
  const toAssetPrice = await oracle.getAssetPrice(toAsset);

  return await convertToCurrencyDecimals(
    toAsset,
    new BigNumber(await convertToCurrencyUnits(fromAsset, amount.toString()))
      .multipliedBy(fromAssetPrice.toString())
      .dividedBy(toAssetPrice.toString())
      .multipliedBy(1 - slippage) // swap loss
      .toFixed(0)
  );
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

makeSuite('AURABBA3USD Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const leverage = 36000;
  let aurabba3usdLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, aurabb_a3_usd, vaultWhitelist, auraBBA3USDVault, users, owner } =
      testEnv;
    aurabba3usdLevSwap = await getCollateralLevSwapper(testEnv, aurabb_a3_usd.address);
    ltv = (await helpersContract.getReserveConfigurationData(aurabb_a3_usd.address)).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(auraBBA3USDVault.address, aurabba3usdLevSwap.address);
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistUser(auraBBA3USDVault.address, users[0].address);
  });
  describe('leavePosition - full amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        aAURABB_A3_USD,
        BAL_BB_A3_USD_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        auraBBA3USDVault,
        owner,
      } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A3_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A3_USD_LP.address,
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
      await mint('BAL_BB_A3_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A3_USD_LP.connect(borrower.signer).approve(
        aurabba3usdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabba3usdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, inAmount, usdt.address, BB_A3_USD)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              ZERO_ADDRESS,
              BB_A3_USDT,
              ZERO_ADDRESS,
              BB_A3_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_USDT_POOLID, 0, 0],
              [BB_A3_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: usdt.address,
            swapTo: BB_A3_USD,
            inAmount,
            outAmount: expectOutAmount.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A3_USD,
              ZERO_ADDRESS,
              BB_A3_USDT,
              ZERO_ADDRESS,
              usdt.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_USD_POOLID, 0, 0],
              [BB_A3_USDT_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A3_USD,
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
        aurabba3usdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBA3USDVault.address, borrower.address);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdt.address, 0, swapInfo);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount,
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        usdt.address
      );
      const reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, usdt.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await vaultWhitelist
        .connect(owner.signer)
        .removeAddressFromWhitelistUser(auraBBA3USDVault.address, borrower.address);

      await expect(
        aurabba3usdLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            usdt.address,
            aAURABB_A3_USD.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBA3USDVault.address, borrower.address);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          usdt.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
      );
    });
    it('USDC as borrowing asset', async () => {
      const {
        users,
        usdc,
        BAL_BB_A3_USD_LP,
        aAURABB_A3_USD,
        pool,
        helpersContract,
        vaultWhitelist,
        auraBBA3USDVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A3_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A3_USD_LP.address,
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
      await mint('BAL_BB_A3_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A3_USD_LP.connect(borrower.signer).approve(
        aurabba3usdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabba3usdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, inAmount, usdc.address, BB_A3_USD)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              ZERO_ADDRESS,
              BB_A3_USDC,
              ZERO_ADDRESS,
              BB_A3_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_USDC_POOLID, 0, 0],
              [BB_A3_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: usdc.address,
            swapTo: BB_A3_USD,
            inAmount,
            outAmount: expectOutAmount.toFixed(),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A3_USD,
              ZERO_ADDRESS,
              BB_A3_USDC,
              ZERO_ADDRESS,
              usdc.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_USD_POOLID, 0, 0],
              [BB_A3_USDC_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A3_USD,
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
        aurabba3usdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBA3USDVault.address, borrower.address);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, usdc.address, 0, swapInfo);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount,
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        usdc.address
      );
      const reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, usdc.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await vaultWhitelist
        .connect(owner.signer)
        .removeAddressFromWhitelistUser(auraBBA3USDVault.address, borrower.address);
      await expect(
        aurabba3usdLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            usdc.address,
            aAURABB_A3_USD.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBA3USDVault.address, borrower.address);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          usdc.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
      );
    });
    it('DAI as borrowing asset', async () => {
      const {
        users,
        dai,
        TUSD,
        BAL_BB_A3_USD_LP,
        aAURABB_A3_USD,
        pool,
        helpersContract,
        vaultWhitelist,
        auraBBA3USDVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A3_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A3_USD_LP.address,
          LPAmount,
          ltv,
          leverage,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('BAL_BB_A3_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A3_USD_LP.connect(borrower.signer).approve(
        aurabba3usdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabba3usdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, inAmount, dai.address, BB_A3_USD)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              ZERO_ADDRESS,
              BB_A3_DAI,
              ZERO_ADDRESS,
              BB_A3_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_DAI_POOLID, 0, 0],
              [BB_A3_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: dai.address,
            swapTo: BB_A3_USD,
            inAmount,
            outAmount: expectOutAmount.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A3_USD,
              ZERO_ADDRESS,
              BB_A3_DAI,
              ZERO_ADDRESS,
              dai.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_USD_POOLID, 0, 0],
              [BB_A3_DAI_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A3_USD,
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
        aurabba3usdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo)
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBA3USDVault.address, borrower.address);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, dai.address, 0, swapInfo);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      const reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfter.totalCollateralETH,
        userGlobalDataAfter.totalDebtETH,
        repayAmount,
        userGlobalDataAfter.currentLiquidationThreshold,
        userGlobalDataAfter.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        dai.address
      );
      const reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, dai.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await vaultWhitelist
        .connect(owner.signer)
        .removeAddressFromWhitelistUser(auraBBA3USDVault.address, borrower.address);
      await expect(
        aurabba3usdLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            dai.address,
            aAURABB_A3_USD.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBA3USDVault.address, borrower.address);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          dai.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
      );
    });
  });
});

makeSuite('AURABBAUSD Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage2 = '70'; //0.7%
  const leverage = 36000;
  let aurabba3usdLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    const { helpersContract, aurabb_a3_usd, vaultWhitelist, auraBBA3USDVault, owner } = testEnv;
    aurabba3usdLevSwap = await getCollateralLevSwapper(testEnv, aurabb_a3_usd.address);
    ltv = (await helpersContract.getReserveConfigurationData(aurabb_a3_usd.address)).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(auraBBA3USDVault.address, aurabba3usdLevSwap.address);
  });
  describe('leavePosition - partial amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, TUSD, aAURABB_A3_USD, BAL_BB_A3_USD_LP, pool, helpersContract } =
        testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A3_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A3_USD_LP.address,
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
      await mint('BAL_BB_A3_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A3_USD_LP.connect(borrower.signer).approve(
        aurabba3usdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabba3usdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdt.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, inAmount, usdt.address, BB_A3_USD)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              ZERO_ADDRESS,
              BB_A3_USDT,
              ZERO_ADDRESS,
              BB_A3_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_USDT_POOLID, 0, 0],
              [BB_A3_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: usdt.address,
            swapTo: BB_A3_USD,
            inAmount,
            outAmount: expectOutAmount.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A3_USD,
              ZERO_ADDRESS,
              BB_A3_USDT,
              ZERO_ADDRESS,
              usdt.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_USD_POOLID, 0, 0],
              [BB_A3_USDT_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A3_USD,
            swapTo: usdt.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await aurabba3usdLevSwap
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

      const beforeBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        usdt.address
      );
      let reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, usdt.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          usdt.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        usdt.address
      );
      reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, usdt.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          usdt.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        usdt.address
      );
      reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, usdt.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          usdt.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        usdt.address
      );
      reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, usdt.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          usdt.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      const { users, usdc, BAL_BB_A3_USD_LP, aAURABB_A3_USD, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A3_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A3_USD_LP.address,
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
      await mint('BAL_BB_A3_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A3_USD_LP.connect(borrower.signer).approve(
        aurabba3usdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabba3usdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, usdc.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, inAmount, usdc.address, BB_A3_USD)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              ZERO_ADDRESS,
              BB_A3_USDC,
              ZERO_ADDRESS,
              BB_A3_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_USDC_POOLID, 0, 0],
              [BB_A3_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: usdc.address,
            swapTo: BB_A3_USD,
            inAmount,
            outAmount: expectOutAmount.toFixed(),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A3_USD,
              ZERO_ADDRESS,
              BB_A3_USDC,
              ZERO_ADDRESS,
              usdc.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_USD_POOLID, 0, 0],
              [BB_A3_USDC_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A3_USD,
            swapTo: usdc.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await aurabba3usdLevSwap
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

      const beforeBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        usdc.address
      );
      let reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, usdc.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          usdc.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        usdc.address
      );
      reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, usdc.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          usdc.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        usdc.address
      );
      reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, usdc.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          usdc.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        usdc.address
      );
      reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, usdc.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          usdc.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      const { users, dai, TUSD, BAL_BB_A3_USD_LP, aAURABB_A3_USD, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A3_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A3_USD_LP.address,
          LPAmount,
          ltv,
          leverage,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('BAL_BB_A3_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A3_USD_LP.connect(borrower.signer).approve(
        aurabba3usdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabba3usdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const inAmount = (await calcInAmount(testEnv, LPAmount, leverage, dai.address)).toString();
      const expectOutAmount = new BigNumber(
        (await calcMinAmountOut(testEnv, inAmount, dai.address, BB_A3_USD)).toString()
      );
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              ZERO_ADDRESS,
              BB_A3_DAI,
              ZERO_ADDRESS,
              BB_A3_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_DAI_POOLID, 0, 0],
              [BB_A3_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: dai.address,
            swapTo: BB_A3_USD,
            inAmount,
            outAmount: expectOutAmount.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A3_USD,
              ZERO_ADDRESS,
              BB_A3_DAI,
              ZERO_ADDRESS,
              dai.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A3_USD_POOLID, 0, 0],
              [BB_A3_DAI_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A3_USD,
            swapTo: dai.address,
            inAmount: 0,
            outAmount: 0,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await aurabba3usdLevSwap
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

      const beforeBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      let reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterEnter.totalCollateralETH,
        userGlobalDataAfterEnter.totalDebtETH,
        repayAmount.div(10).toString(),
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        userGlobalDataAfterEnter.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        dai.address
      );
      let reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, dai.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          dai.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(2).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        dai.address
      );
      reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, dai.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          dai.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(3).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        dai.address
      );
      reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, dai.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          dai.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A3_USD.balanceOf(borrower.address);
      await aAURABB_A3_USD
        .connect(borrower.signer)
        .approve(aurabba3usdLevSwap.address, balanceInSturdy.mul(2));

      reverseInAmount = await calcWithdrawalAmount(
        testEnv,
        userGlobalDataAfterLeave.totalCollateralETH,
        userGlobalDataAfterLeave.totalDebtETH,
        repayAmount.div(10).mul(4).toString(),
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        userGlobalDataAfterLeave.currentLiquidationThreshold,
        balanceInSturdy,
        BAL_BB_A3_USD_LP.address,
        dai.address
      );
      reverseExpectOutAmount = new BigNumber(
        (
          await calcMinAmountOut(testEnv, reverseInAmount.toFixed(0), BB_A3_USD, dai.address)
        ).toString()
      );
      swapInfo.reversePaths[0].inAmount = reverseInAmount.toFixed(0);
      swapInfo.reversePaths[0].outAmount = reverseExpectOutAmount.toFixed(0);
      await aurabba3usdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          dai.address,
          aAURABB_A3_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A3_USD_LP.balanceOf(borrower.address);
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
