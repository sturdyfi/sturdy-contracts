import BigNumber from 'bignumber.js';
import { ethers, BigNumberish } from 'ethers';
import {
  DRE,
  impersonateAccountsHardhat,
  advanceBlock,
  timeLatest,
} from '../../helpers/misc-utils';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals, getContract } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { printUserAccountData, printDivider } from './helpers/utils/helpers';
import type { ICurveExchange } from '../../types/ICurveExchange';
import { IERC20DetailedFactory } from '../../types/IERC20DetailedFactory';

const chai = require('chai');
const { expect } = chai;
const { parseEther } = ethers.utils;

const CONVEX_YIELD_PERIOD = 100000;

const simulateYield = async (testEnv: TestEnv) => {
  await simulateYieldInConvexETHSTETHVault(testEnv);
};

const simulateYieldInConvexETHSTETHVault = async (testEnv: TestEnv) => {
  const { convexETHSTETHVault, users, ETH_STETH_LP } = testEnv;
  const ethers = (DRE as any).ethers;
  const borrower = users[1];
  const ETHSTETHLPOwnerAddress = '0x43378368D84D4bA00D1C8E97EC2E6016A82fC062';
  const depositETHSTETH = '15';
  const depositETHSTETHAmount = await convertToCurrencyDecimals(
    ETH_STETH_LP.address,
    depositETHSTETH
  );

  await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
  let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);

  //transfer to borrower
  await ETH_STETH_LP.connect(signer).transfer(borrower.address, depositETHSTETHAmount);

  //approve protocol to access borrower wallet
  await ETH_STETH_LP.connect(borrower.signer).approve(
    convexETHSTETHVault.address,
    APPROVAL_AMOUNT_LENDING_POOL
  );

  // deposit collateral to borrow
  await convexETHSTETHVault
    .connect(borrower.signer)
    .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);

  await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());
  // process yield, so yield should be sented to YieldManager
  await convexETHSTETHVault.processYield();
};

const depositWETH = async (
  testEnv: TestEnv,
  depositor: SignerWithAddress,
  amount: BigNumberish
) => {
  const { pool, weth } = testEnv;
  const ethers = (DRE as any).ethers;

  const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
  await impersonateAccountsHardhat([wethOwnerAddress]);
  let signer = await ethers.provider.getSigner(wethOwnerAddress);
  await weth.connect(signer).transfer(depositor.address, amount);

  //approve protocol to access depositor wallet
  await weth.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

  //Supplier  deposits 7 WETH
  await pool.connect(depositor.signer).deposit(weth.address, amount, depositor.address, '0');
};

makeSuite('Yield Manger: configuration', (testEnv) => {
  it('Registered reward asset count should be 2', async () => {
    const { yieldManager } = testEnv;
    const availableAssetCount = 2;
    const assetCount = await yieldManager.getAssetCount();
    expect(assetCount).to.be.eq(availableAssetCount);
  });
  it('CRV should be a reward asset.', async () => {
    const { yieldManager, CRV } = testEnv;
    const assetCount = await yieldManager.getAssetCount();
    let registered = false;
    let index = 0;
    while (assetCount.gt(index)) {
      const assetAddress = await yieldManager.getAssetInfo(index++);
      if (assetAddress.toLowerCase() == CRV.address.toLowerCase()) {
        registered = true;
        break;
      }
    }
    expect(registered).to.be.equal(true);
  });
  it('CVX should be a reward asset.', async () => {
    const { yieldManager, CVX } = testEnv;
    const assetCount = await yieldManager.getAssetCount();
    let registered = false;
    let index = 0;
    while (assetCount.gt(index)) {
      const assetAddress = await yieldManager.getAssetInfo(index++);
      if (assetAddress.toLowerCase() == CVX.address.toLowerCase()) {
        registered = true;
        break;
      }
    }
    expect(registered).to.be.equal(true);
  });
  it('Should be WETH as an exchange token', async () => {
    const { yieldManager, weth } = testEnv;
    const asset = await yieldManager._exchangeToken();
    expect(asset).to.be.eq(weth.address);
  });
  it('Should be failed when set invalid address as an exchange token', async () => {
    const { yieldManager } = testEnv;
    await expect(yieldManager.setExchangeToken(ZERO_ADDRESS)).to.be.reverted;
  });
});

makeSuite('Yield Manager: simulate yield in vaults', (testEnv) => {
  it('Convex ETHSTETH vault', async () => {
    const { CRV, CVX, yieldManager } = testEnv;
    const beforeBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const beforeBalanceOfCVX = await CVX.balanceOf(yieldManager.address);
    await simulateYieldInConvexETHSTETHVault(testEnv);
    const afterBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const afterBalanceOfCVX = await CRV.balanceOf(yieldManager.address);
    expect(afterBalanceOfCRV).to.be.gt(beforeBalanceOfCRV);
    expect(afterBalanceOfCVX).to.be.gt(beforeBalanceOfCVX);
  });
});

makeSuite('Yield Manger: distribute yield', (testEnv) => {
  it('Should be failed when use swap path including invalid tokens', async () => {
    const { yieldManager, weth, users } = testEnv;
    const assetCount = 1;
    const paths = [
      {
        u_path: {
          tokens: [weth.address, weth.address],
          fees: [100],
        },
        b_path: {
          tokens: [],
          poolIds: [],
        },
      },
    ];
    const slippage = 500;

    // suppliers deposit asset to pool
    const depositor1 = users[4];
    const depositWETHAmount = await convertToCurrencyDecimals(weth.address, '7');
    await depositWETH(testEnv, depositor1, depositWETHAmount);

    // Simulate Yield
    await simulateYield(testEnv);

    await expect(yieldManager.distributeYield(0, assetCount, slippage, paths)).to.be.revertedWith(
      '101'
    );
  });
  it('Distribute yield', async () => {
    const {
      yieldManager,
      weth,
      aWeth,
      users,
      CRV,
      CVX,
      aprProvider,
    } = testEnv;

    // suppliers deposit asset to pool
    const depositor1 = users[0];
    const depositWETHAmount = await convertToCurrencyDecimals(weth.address, '7');
    await depositWETH(testEnv, depositor1, depositWETHAmount);
    expect((await aWeth.balanceOf(depositor1.address)).eq(depositWETHAmount)).to.be.equal(true);

    // Simulate Yield
    await simulateYield(testEnv);

    // Distribute yields
    const assetCount = await yieldManager.getAssetCount();
    const paths = [
      {
        u_path: {
          tokens: [CRV.address, weth.address],
          fees: [10000],
        },
        b_path: {
          tokens: [],
          poolIds: [],
        },
      },
      {
        u_path: {
          tokens: [CVX.address, weth.address],
          fees: [10000],
        },
        b_path: {
          tokens: [],
          poolIds: [],
        },
      },
    ];
    const slippage = 500;
    await yieldManager.distributeYield(0, assetCount, slippage, paths);

    expect((await aWeth.balanceOf(depositor1.address)).gt(depositWETHAmount)).to.be.equal(true);
    expect((await aprProvider.APR(weth.address, true)).gt(0)).to.be.equal(true);
    console.log('APR: ', (Number(await aprProvider.APR(weth.address, true)) / 1e18) * 100);
  });
});