import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { oneEther, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import { MintableERC20, IGeneralLevSwap2, IGeneralLevSwap2__factory } from '../../types';
import { ProtocolErrors, tEthereumAddress } from '../../helpers/types';

const chai = require('chai');
const { expect } = chai;

const MultiSwapPathInitData = {
  routes: new Array(9).fill(ZERO_ADDRESS),
  routeParams: new Array(4).fill([0, 0, 0]) as any,
  swapType: 0, //NONE
  poolCount: 0,
  swapFrom: ZERO_ADDRESS,
  swapTo: ZERO_ADDRESS,
};

const BB_A_USDT = '0x2F4eb100552ef93840d5aDC30560E5513DFfFACb';
const BB_A_USDT_POOLID = '0x2f4eb100552ef93840d5adc30560e5513dfffacb000000000000000000000334';
const BB_A_USDC = '0x82698aeCc9E28e9Bb27608Bd52cF57f704BD1B83';
const BB_A_USDC_POOLID = '0x82698aecc9e28e9bb27608bd52cf57f704bd1b83000000000000000000000336';
const BB_A_DAI = '0xae37D54Ae477268B9997d4161B96b8200755935c';
const BB_A_DAI_POOLID = '0xae37d54ae477268b9997d4161b96b8200755935c000000000000000000000337';
const BB_A_USD = '0xA13a9247ea42D743238089903570127DdA72fE44';
const BB_A_USD_POOLID = '0xa13a9247ea42d743238089903570127dda72fe4400000000000000000000035d';

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
  const { usdc, dai, usdt, BAL_BB_A_USD_LP } = testEnv;
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
  } else if (reserveSymbol == 'BAL_BB_A_USD_LP') {
    ownerAddress = '0x43b650399F2E4D6f03503f44042fabA8F7D73470';
    token = BAL_BB_A_USD_LP;
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

makeSuite('AURABBAUSD Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage2 = '100';
  const leverage = 36000;
  let aurabbausdLevSwap = {} as IGeneralLevSwap2;
  let ltv = '';

  before(async () => {
    const { helpersContract, aurabb_a_usd, vaultWhitelist, auraBBAUSDVault, users, owner } =
      testEnv;
    aurabbausdLevSwap = await getCollateralLevSwapper(testEnv, aurabb_a_usd.address);
    ltv = (await helpersContract.getReserveConfigurationData(aurabb_a_usd.address)).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(auraBBAUSDVault.address, aurabbausdLevSwap.address);
    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistUser(auraBBAUSDVault.address, users[0].address);
  });
  describe('leavePosition - full amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const {
        users,
        usdt,
        TUSD,
        aAURABB_A_USD,
        BAL_BB_A_USD_LP,
        pool,
        helpersContract,
        vaultWhitelist,
        auraBBAUSDVault,
        owner,
      } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A_USD_LP.address,
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
      await mint('BAL_BB_A_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A_USD_LP.connect(borrower.signer).approve(
        aurabbausdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabbausdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              ZERO_ADDRESS,
              BB_A_USDT,
              ZERO_ADDRESS,
              BB_A_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_USDT_POOLID, 0, 0],
              [BB_A_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: usdt.address,
            swapTo: BB_A_USD,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A_USD,
              ZERO_ADDRESS,
              BB_A_USDT,
              ZERO_ADDRESS,
              usdt.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_USD_POOLID, 0, 0],
              [BB_A_USDT_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A_USD,
            swapTo: usdt.address,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await expect(
        aurabbausdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(
            principalAmount,
            leverage,
            slippage2,
            usdt.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBAUSDVault.address, borrower.address);
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(
          principalAmount,
          leverage,
          slippage2,
          usdt.address,
          0,
          swapInfo
        );

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await vaultWhitelist
        .connect(owner.signer)
        .removeAddressFromWhitelistUser(auraBBAUSDVault.address, borrower.address);

      await expect(
        aurabbausdLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            slippage2,
            usdt.address,
            aAURABB_A_USD.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBAUSDVault.address, borrower.address);
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          slippage2,
          usdt.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
      );
    });
    it('USDC as borrowing asset', async () => {
      const {
        users,
        usdc,
        BAL_BB_A_USD_LP,
        aAURABB_A_USD,
        pool,
        helpersContract,
        vaultWhitelist,
        auraBBAUSDVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A_USD_LP.address,
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
      await mint('BAL_BB_A_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A_USD_LP.connect(borrower.signer).approve(
        aurabbausdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabbausdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              ZERO_ADDRESS,
              BB_A_USDC,
              ZERO_ADDRESS,
              BB_A_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_USDC_POOLID, 0, 0],
              [BB_A_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: usdc.address,
            swapTo: BB_A_USD,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A_USD,
              ZERO_ADDRESS,
              BB_A_USDC,
              ZERO_ADDRESS,
              usdc.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_USD_POOLID, 0, 0],
              [BB_A_USDC_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A_USD,
            swapTo: usdc.address,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await expect(
        aurabbausdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(
            principalAmount,
            leverage,
            slippage2,
            usdc.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBAUSDVault.address, borrower.address);
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(
          principalAmount,
          leverage,
          slippage2,
          usdc.address,
          0,
          swapInfo
        );

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await vaultWhitelist
        .connect(owner.signer)
        .removeAddressFromWhitelistUser(auraBBAUSDVault.address, borrower.address);
      await expect(
        aurabbausdLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            slippage2,
            usdc.address,
            aAURABB_A_USD.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBAUSDVault.address, borrower.address);
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          slippage2,
          usdc.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
      );
    });
    it('DAI as borrowing asset', async () => {
      const {
        users,
        dai,
        TUSD,
        BAL_BB_A_USD_LP,
        aAURABB_A_USD,
        pool,
        helpersContract,
        vaultWhitelist,
        auraBBAUSDVault,
        owner,
      } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A_USD_LP.address,
          LPAmount,
          ltv,
          leverage,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('BAL_BB_A_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A_USD_LP.connect(borrower.signer).approve(
        aurabbausdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabbausdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              ZERO_ADDRESS,
              BB_A_DAI,
              ZERO_ADDRESS,
              BB_A_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_DAI_POOLID, 0, 0],
              [BB_A_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: dai.address,
            swapTo: BB_A_USD,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A_USD,
              ZERO_ADDRESS,
              BB_A_DAI,
              ZERO_ADDRESS,
              dai.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_USD_POOLID, 0, 0],
              [BB_A_DAI_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A_USD,
            swapTo: dai.address,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await expect(
        aurabbausdLevSwap
          .connect(borrower.signer)
          .enterPositionWithFlashloan(
            principalAmount,
            leverage,
            slippage2,
            dai.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBAUSDVault.address, borrower.address);
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, slippage2, dai.address, 0, swapInfo);

      const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      const beforeBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      const balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await vaultWhitelist
        .connect(owner.signer)
        .removeAddressFromWhitelistUser(auraBBAUSDVault.address, borrower.address);
      await expect(
        aurabbausdLevSwap
          .connect(borrower.signer)
          .withdrawWithFlashloan(
            repayAmount.toString(),
            principalAmount,
            slippage2,
            dai.address,
            aAURABB_A_USD.address,
            0,
            swapInfo
          )
      ).to.be.revertedWith('118');
      await vaultWhitelist
        .connect(owner.signer)
        .addAddressToWhitelistUser(auraBBAUSDVault.address, borrower.address);
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.toString(),
          principalAmount,
          slippage2,
          dai.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      const afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
      expect(afterBalanceOfBorrower.mul('100').div(principalAmount).toString()).to.be.bignumber.gte(
        '98'
      );
    });
  });
});

makeSuite('AURABBAUSD Deleverage with Flashloan', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  const LPAmount = '1000';
  const slippage2 = '100';
  const leverage = 36000;
  let aurabbausdLevSwap = {} as IGeneralLevSwap2;
  let ltv = '';

  before(async () => {
    const { helpersContract, aurabb_a_usd, vaultWhitelist, auraBBAUSDVault, owner } = testEnv;
    aurabbausdLevSwap = await getCollateralLevSwapper(testEnv, aurabb_a_usd.address);
    ltv = (await helpersContract.getReserveConfigurationData(aurabb_a_usd.address)).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(auraBBAUSDVault.address, aurabbausdLevSwap.address);
  });
  describe('leavePosition - partial amount:', async () => {
    it('USDT as borrowing asset', async () => {
      const { users, usdt, TUSD, aAURABB_A_USD, BAL_BB_A_USD_LP, pool, helpersContract } = testEnv;

      const depositor = users[0];
      const borrower = users[1];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A_USD_LP.address,
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
      await mint('BAL_BB_A_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A_USD_LP.connect(borrower.signer).approve(
        aurabbausdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabbausdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const swapInfo = {
        paths: [
          {
            routes: [
              usdt.address,
              ZERO_ADDRESS,
              BB_A_USDT,
              ZERO_ADDRESS,
              BB_A_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_USDT_POOLID, 0, 0],
              [BB_A_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: usdt.address,
            swapTo: BB_A_USD,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A_USD,
              ZERO_ADDRESS,
              BB_A_USDT,
              ZERO_ADDRESS,
              usdt.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_USD_POOLID, 0, 0],
              [BB_A_USDT_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A_USD,
            swapTo: usdt.address,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(
          principalAmount,
          leverage,
          slippage2,
          usdt.address,
          0,
          swapInfo
        );

      const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

      const beforeBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          slippage2,
          usdt.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          slippage2,
          usdt.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          slippage2,
          usdt.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          slippage2,
          usdt.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      const { users, usdc, BAL_BB_A_USD_LP, aAURABB_A_USD, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[2];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A_USD_LP.address,
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
      await mint('BAL_BB_A_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A_USD_LP.connect(borrower.signer).approve(
        aurabbausdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabbausdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const swapInfo = {
        paths: [
          {
            routes: [
              usdc.address,
              ZERO_ADDRESS,
              BB_A_USDC,
              ZERO_ADDRESS,
              BB_A_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_USDC_POOLID, 0, 0],
              [BB_A_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: usdc.address,
            swapTo: BB_A_USD,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A_USD,
              ZERO_ADDRESS,
              BB_A_USDC,
              ZERO_ADDRESS,
              usdc.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_USD_POOLID, 0, 0],
              [BB_A_USDC_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A_USD,
            swapTo: usdc.address,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(
          principalAmount,
          leverage,
          slippage2,
          usdc.address,
          0,
          swapInfo
        );

      const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

      const beforeBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          slippage2,
          usdc.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          slippage2,
          usdc.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          slippage2,
          usdc.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          slippage2,
          usdc.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      const { users, dai, TUSD, BAL_BB_A_USD_LP, aAURABB_A_USD, pool, helpersContract } = testEnv;
      const depositor = users[0];
      const borrower = users[3];
      const principalAmount = (
        await convertToCurrencyDecimals(BAL_BB_A_USD_LP.address, LPAmount)
      ).toString();
      const amountToDelegate = (
        await calcTotalBorrowAmount(
          testEnv,
          BAL_BB_A_USD_LP.address,
          LPAmount,
          ltv,
          leverage,
          dai.address
        )
      ).toString();

      await mint('DAI', amountToDelegate, depositor, testEnv);
      await depositToLendingPool(dai, depositor, amountToDelegate, testEnv);

      // Prepare Collateral
      await mint('BAL_BB_A_USD_LP', principalAmount, borrower, testEnv);
      await BAL_BB_A_USD_LP.connect(borrower.signer).approve(
        aurabbausdLevSwap.address,
        principalAmount
      );

      // approve delegate borrow
      const daiDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(dai.address))
        .variableDebtTokenAddress;
      const varDebtToken = await getVariableDebtToken(daiDebtTokenAddress);
      await varDebtToken
        .connect(borrower.signer)
        .approveDelegation(aurabbausdLevSwap.address, amountToDelegate);

      const userGlobalDataBefore = await pool.getUserAccountData(borrower.address);
      expect(userGlobalDataBefore.totalCollateralETH.toString()).to.be.bignumber.equal('0');
      expect(userGlobalDataBefore.totalDebtETH.toString()).to.be.bignumber.equal('0');

      // leverage
      const swapInfo = {
        paths: [
          {
            routes: [
              dai.address,
              ZERO_ADDRESS,
              BB_A_DAI,
              ZERO_ADDRESS,
              BB_A_USD,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_DAI_POOLID, 0, 0],
              [BB_A_USD_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: dai.address,
            swapTo: BB_A_USD,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        reversePaths: [
          {
            routes: [
              BB_A_USD,
              ZERO_ADDRESS,
              BB_A_DAI,
              ZERO_ADDRESS,
              dai.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [BB_A_USD_POOLID, 0, 0],
              [BB_A_DAI_POOLID, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 3, // balancer
            poolCount: 2,
            swapFrom: BB_A_USD,
            swapTo: dai.address,
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .enterPositionWithFlashloan(principalAmount, leverage, slippage2, dai.address, 0, swapInfo);

      const userGlobalDataAfterEnter = await pool.getUserAccountData(borrower.address);

      expect(userGlobalDataAfterEnter.totalCollateralETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.totalDebtETH.toString()).to.be.bignumber.gt('0');
      expect(userGlobalDataAfterEnter.healthFactor.toString()).to.be.bignumber.gt(
        oneEther.toFixed(0),
        INVALID_HF
      );

      console.log('enterPosition HealthFactor: ', userGlobalDataAfterEnter.healthFactor.toString());

      const beforeBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
      expect(beforeBalanceOfBorrower.toString()).to.be.bignumber.eq('0');

      //de-leverage 10% amount
      let balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      const repayAmount = await varDebtToken.balanceOf(borrower.address);
      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).toString(),
          (Number(principalAmount) / 10).toFixed(),
          slippage2,
          dai.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      let userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      let afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(2).toString(),
          ((Number(principalAmount) / 10) * 2).toFixed(),
          slippage2,
          dai.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(3).toString(),
          ((Number(principalAmount) / 10) * 3).toFixed(),
          slippage2,
          dai.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
      balanceInSturdy = await aAURABB_A_USD.balanceOf(borrower.address);
      await aAURABB_A_USD
        .connect(borrower.signer)
        .approve(aurabbausdLevSwap.address, balanceInSturdy.mul(2));

      await aurabbausdLevSwap
        .connect(borrower.signer)
        .withdrawWithFlashloan(
          repayAmount.div(10).mul(4).toString(),
          ((Number(principalAmount) / 10) * 4).toFixed(),
          slippage2,
          dai.address,
          aAURABB_A_USD.address,
          0,
          swapInfo
        );

      userGlobalDataAfterLeave = await pool.getUserAccountData(borrower.address);
      afterBalanceOfBorrower = await BAL_BB_A_USD_LP.balanceOf(borrower.address);
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
