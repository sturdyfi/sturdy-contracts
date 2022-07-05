import BigNumber from 'bignumber.js';
import { ethers, BigNumberish } from 'ethers';
import {
  DRE,
  impersonateAccountsHardhat,
  advanceBlock,
  timeLatest,
} from '../../helpers/misc-utils';
import { APPROVAL_AMOUNT_LENDING_POOL, oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals, convertToCurrencyUnits } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { printUserAccountData, printDivider } from './helpers/utils/helpers';
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import type { ICurveExchange } from '../../types/ICurveExchange';
import { IERC20DetailedFactory } from '../../types/IERC20DetailedFactory';
import { ThreeCrvFraxLevSwapFactory } from '../../types';
import { ProtocolErrors, RateMode } from '../../helpers/types';

const chai = require('chai');
const { expect } = chai;
const { parseEther } = ethers.utils;

const getLevSwapper = async (testEnv: TestEnv) => {
  const { levSwapManager, FRAX_3CRV_LP, deployer } = testEnv;

  const levSwapAddress = await levSwapManager.getLevSwapper(FRAX_3CRV_LP.address);
  return ThreeCrvFraxLevSwapFactory.connect(levSwapAddress, deployer.signer);
};

const prepareCollateralForUser = async (
  testEnv: TestEnv,
  user: SignerWithAddress,
  amount: BigNumberish
) => {
  const { FRAX_3CRV_LP } = testEnv;
  const ethers = (DRE as any).ethers;

  const LPOwnerAddress = '0x605b5f6549538a94bd2653d1ee67612a47039da0';
  await impersonateAccountsHardhat([LPOwnerAddress]);
  const signer = await ethers.provider.getSigner(LPOwnerAddress);

  //transfer to borrower
  await FRAX_3CRV_LP.connect(signer).transfer(user.address, amount);
};

const depositUSDC = async (
  testEnv: TestEnv,
  depositor: SignerWithAddress,
  amount: BigNumberish
) => {
  const { pool, usdc } = testEnv;
  const ethers = (DRE as any).ethers;

  const usdcOwnerAddress = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
  await impersonateAccountsHardhat([usdcOwnerAddress]);
  let signer = await ethers.provider.getSigner(usdcOwnerAddress);
  await usdc.connect(signer).transfer(depositor.address, amount);

  //approve protocol to access depositor wallet
  await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

  //Supplier  deposits 7000 USDC
  await pool.connect(depositor.signer).deposit(usdc.address, amount, depositor.address, '0');
};

const depositUSDT = async (
  testEnv: TestEnv,
  depositor: SignerWithAddress,
  amount: BigNumberish
) => {
  const { pool, usdt } = testEnv;
  const ethers = (DRE as any).ethers;

  const usdtOwnerAddress = '0x5754284f345afc66a98fbB0a0Afe71e0F007B949';
  await impersonateAccountsHardhat([usdtOwnerAddress]);
  let signer = await ethers.provider.getSigner(usdtOwnerAddress);
  await usdt.connect(signer).transfer(depositor.address, amount);

  //approve protocol to access depositor wallet
  await usdt.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

  //Supplier  deposits 7000 USDT
  await pool.connect(depositor.signer).deposit(usdt.address, amount, depositor.address, '0');
};

makeSuite('Leverage Swap Manger: configuration', (testEnv) => {});

makeSuite('Leverage Swap Manger: FRAX3CRV', (testEnv) => {
  const { INVALID_HF } = ProtocolErrors;
  it('Available stable coins', async () => {
    const { dai, usdc, usdt } = testEnv;

    const levSwap = await getLevSwapper(testEnv);

    const coins = (await levSwap.getAvailableStableCoins()).map((coin) => coin.toUpperCase());
    expect(coins.length).to.be.equal(3);
    expect(coins.includes(dai.address.toUpperCase())).to.be.equal(true);
    expect(coins.includes(usdc.address.toUpperCase())).to.be.equal(true);
    expect(coins.includes(usdt.address.toUpperCase())).to.be.equal(true);
  });
  it('should be reverted if try to use zero collateral amount', async () => {
    const { dai } = testEnv;
    const levSwap = await getLevSwapper(testEnv);
    const supplyAmount = 0;
    const iterations = 1;
    await expect(levSwap.enterPosition(supplyAmount, iterations, dai.address)).to.be.revertedWith(
      '113'
    );
  });
  it('should be reverted if try to use invalid stable coin', async () => {
    const { aDai } = testEnv;
    const levSwap = await getLevSwapper(testEnv);
    const supplyAmount = 10;
    const iterations = 1;
    await expect(levSwap.enterPosition(supplyAmount, iterations, aDai.address)).to.be.revertedWith(
      '114'
    );
  });
  it('should be reverted when collateral is not enough', async () => {
    const { users, dai, FRAX_3CRV_LP } = testEnv;

    const levSwap = await getLevSwapper(testEnv);
    const borrower = users[1];
    const supplyAmount = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '1000');
    const iterations = 1;
    await expect(
      levSwap.connect(borrower.signer).enterPosition(supplyAmount, iterations, dai.address)
    ).to.be.revertedWith('115');
  });
  it('should be successed when collateral is enough', async () => {
    const { users, usdt, FRAX_3CRV_LP, pool, helpersContract } = testEnv;

    const levSwap = await getLevSwapper(testEnv);
    const depositor = users[0];
    const borrower = users[1];
    const supplyAmount = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '1000');
    const amountToDelegate = await convertToCurrencyDecimals(usdt.address, '200000');
    const iterations = 10;

    // Deposit USDC to Lending Pool
    await depositUSDT(testEnv, depositor, amountToDelegate);

    // Prepare Collateral
    await prepareCollateralForUser(testEnv, borrower, supplyAmount);
    await FRAX_3CRV_LP.connect(borrower.signer).approve(levSwap.address, supplyAmount);

    const usdtDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdt.address))
      .variableDebtTokenAddress;
    const varDebtToken = await getVariableDebtToken(usdtDebtTokenAddress);

    await varDebtToken
      .connect(borrower.signer)
      .approveDelegation(levSwap.address, amountToDelegate);

    await levSwap.connect(borrower.signer).enterPosition(supplyAmount, iterations, usdt.address);

    const userGlobalData = await pool.getUserAccountData(borrower.address);
    printUserAccountData({
      user: `Borrower ${borrower.address}`,
      action: `Leverage: ${iterations} steps`,
      amount: await convertToCurrencyUnits(FRAX_3CRV_LP.address, supplyAmount.toString()),
      coin: 'FRAX+3CRV',
      ...userGlobalData,
    });
    console.log('Health Factor:', userGlobalData.healthFactor.toString());

    expect(userGlobalData.healthFactor.toString()).to.be.bignumber.gt(
      oneEther.toFixed(0),
      INVALID_HF
    );
  });
});
