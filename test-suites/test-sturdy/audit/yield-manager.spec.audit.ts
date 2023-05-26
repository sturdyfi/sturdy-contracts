import BigNumber from 'bignumber.js';
import { ethers, BigNumberish } from 'ethers';
import {
  DRE,
  impersonateAccountsHardhat,
  advanceBlock,
  timeLatest,
} from '../../../helpers/misc-utils';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../../helpers/constants';
import { convertToCurrencyDecimals, getContract } from '../../../helpers/contracts-helpers';
import { makeSuite, TestEnv, SignerWithAddress } from '../helpers/make-suite';
import { printUserAccountData, printDivider } from '../helpers/utils/helpers';
import type { ICurveExchange } from '../../../types';
import { IERC20Detailed__factory } from '../../../types';

const chai = require('chai');
const { expect } = chai;
const { parseEther } = ethers.utils;

const CONVEX_YIELD_PERIOD = 100000;

const simulateYield = async (testEnv: TestEnv) => {
  // await simulateYieldInLidoVault(testEnv);
  // // await simulateYieldInConvexDOLAVault(testEnv);
  // await simulateYieldInConvexFRAXVault(testEnv);
  // // await simulateYieldInConvexRocketPoolETHVault(testEnv);
  // await simulateYieldInAuraDAIUSDCUSDTVault(testEnv);
  await simulateYieldInConvexTUSDFRAXBPVault(testEnv);
};

const simulateYieldInLidoVault = async (testEnv: TestEnv) => {
  const { pool, lidoVault, users, lido, aStETH } = testEnv;
  const ethers = (DRE as any).ethers;
  const stETHOwnerAddress = '0x41318419cfa25396b47a94896ffa2c77c6434040';
  const depositStETH = '10';
  const depositStETHAmount = await convertToCurrencyDecimals(lido.address, depositStETH);

  await impersonateAccountsHardhat([stETHOwnerAddress]);
  let signer = await ethers.provider.getSigner(stETHOwnerAddress);

  await lido.connect(signer).transfer(aStETH.address, depositStETHAmount);
  await lidoVault.processYield();
};

const simulateYieldInConvexFRAXVault = async (testEnv: TestEnv) => {
  const { convexFRAX3CRVVault, users, cvxfrax_3crv, aCVXFRAX_3CRV, FRAX_3CRV_LP } = testEnv;
  const ethers = (DRE as any).ethers;
  const borrower = users[1];
  const FRAX3CRVLPOwnerAddress = '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a';
  const depositFRAX3CRV = '3000';
  const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
    FRAX_3CRV_LP.address,
    depositFRAX3CRV
  );

  await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
  let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);

  //transfer to borrower
  await FRAX_3CRV_LP.connect(signer).transfer(borrower.address, depositFRAX3CRVAmount);

  //approve protocol to access borrower wallet
  await FRAX_3CRV_LP.connect(borrower.signer).approve(
    convexFRAX3CRVVault.address,
    APPROVAL_AMOUNT_LENDING_POOL
  );

  // deposit collateral to borrow
  await convexFRAX3CRVVault
    .connect(borrower.signer)
    .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);

  await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());
  // process yield, so yield should be sented to YieldManager
  await convexFRAX3CRVVault.processYield();
};

// const simulateYieldInConvexDOLAVault = async (testEnv: TestEnv) => {
//   const { pool, convexDOLA3CRVVault, users, cvxdola_3crv, aCVXDOLA_3CRV, DOLA_3CRV_LP } = testEnv;
//   const ethers = (DRE as any).ethers;
//   const borrower = users[1];
//   const LPOwnerAddress = '0xa83f6bec55a100ca3402245fc1d46127889354ec';
//   const depositDOLA3CRV = '8000';
//   const depositDOLA3CRVAmount = await convertToCurrencyDecimals(
//     DOLA_3CRV_LP.address,
//     depositDOLA3CRV
//   );

//   await impersonateAccountsHardhat([LPOwnerAddress]);
//   let signer = await ethers.provider.getSigner(LPOwnerAddress);

//   //transfer to borrower
//   await DOLA_3CRV_LP.connect(signer).transfer(borrower.address, depositDOLA3CRVAmount);

//   //approve protocol to access borrower wallet
//   await DOLA_3CRV_LP.connect(borrower.signer).approve(
//     convexDOLA3CRVVault.address,
//     APPROVAL_AMOUNT_LENDING_POOL
//   );

//   // deposit collateral to borrow
//   await convexDOLA3CRVVault
//     .connect(borrower.signer)
//     .depositCollateral(DOLA_3CRV_LP.address, depositDOLA3CRVAmount);

//   await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());

//   // process yield, so yield should be sented to YieldManager
//   await convexDOLA3CRVVault.processYield();
// };

// const simulateYieldInConvexRocketPoolETHVault = async (testEnv: TestEnv) => {
//   const { convexRocketPoolETHVault, users, RETH_WSTETH_LP } = testEnv;
//   const ethers = (DRE as any).ethers;
//   const borrower = users[1];
//   const LPOwnerAddress = '0x28ac885d3d8b30bd5733151c732c5f01e18847aa';
//   const depositLP = '50';
//   const depositLPAmount = await convertToCurrencyDecimals(RETH_WSTETH_LP.address, depositLP);

//   await impersonateAccountsHardhat([LPOwnerAddress]);
//   let signer = await ethers.provider.getSigner(LPOwnerAddress);

//   //transfer to borrower
//   await RETH_WSTETH_LP.connect(signer).transfer(borrower.address, depositLPAmount);

//   //approve protocol to access borrower wallet
//   await RETH_WSTETH_LP.connect(borrower.signer).approve(
//     convexRocketPoolETHVault.address,
//     APPROVAL_AMOUNT_LENDING_POOL
//   );

//   // deposit collateral to borrow
//   await convexRocketPoolETHVault
//     .connect(borrower.signer)
//     .depositCollateral(RETH_WSTETH_LP.address, depositLPAmount);

//   await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());

//   // process yield, so yield should be sented to YieldManager
//   await convexRocketPoolETHVault.processYield();
// };

const simulateYieldInAuraDAIUSDCUSDTVault = async (testEnv: TestEnv) => {
  const {
    auraDAIUSDCUSDTVault,
    users,
    auradai_usdc_usdt,
    aAURADAI_USDC_USDT,
    BAL_DAI_USDC_USDT_LP,
  } = testEnv;
  const ethers = (DRE as any).ethers;
  const borrower = users[1];
  const BALDAIUSDCUSDTLPOwnerAddress = '0x1229a70535ab7Cf4b102405eD36e23C9d69Ec0F9';
  const depositBALDAIUSDCUSDT = '15520';
  const depositBALDAIUSDCUSDTAmount = await convertToCurrencyDecimals(
    BAL_DAI_USDC_USDT_LP.address,
    depositBALDAIUSDCUSDT
  );

  await impersonateAccountsHardhat([BALDAIUSDCUSDTLPOwnerAddress]);
  let signer = await ethers.provider.getSigner(BALDAIUSDCUSDTLPOwnerAddress);

  //transfer to borrower
  await BAL_DAI_USDC_USDT_LP.connect(signer).transfer(
    borrower.address,
    depositBALDAIUSDCUSDTAmount
  );

  //approve protocol to access borrower wallet
  await BAL_DAI_USDC_USDT_LP.connect(borrower.signer).approve(
    auraDAIUSDCUSDTVault.address,
    APPROVAL_AMOUNT_LENDING_POOL
  );

  // deposit collateral to borrow
  await auraDAIUSDCUSDTVault
    .connect(borrower.signer)
    .depositCollateral(BAL_DAI_USDC_USDT_LP.address, depositBALDAIUSDCUSDTAmount);

  await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());
  // process yield, so yield should be sented to YieldManager
  await auraDAIUSDCUSDTVault.processYield();
};

const simulateYieldInConvexTUSDFRAXBPVault = async (testEnv: TestEnv) => {
  const { convexTUSDFRAXBPVault, users, TUSD_FRAXBP_LP } = testEnv;
  const ethers = (DRE as any).ethers;
  const borrower = users[1];
  const TUSDFRAXBPLPOwnerAddress = '0x16F570e93fDbC3A4865b7740DEB052eE94d87E15';
  const depositTUSDFRAXBP = '1552';
  const depositTUSDFRAXBPAmount = await convertToCurrencyDecimals(
    TUSD_FRAXBP_LP.address,
    depositTUSDFRAXBP
  );

  await impersonateAccountsHardhat([TUSDFRAXBPLPOwnerAddress]);
  let signer = await ethers.provider.getSigner(TUSDFRAXBPLPOwnerAddress);

  //transfer to borrower
  await TUSD_FRAXBP_LP.connect(signer).transfer(borrower.address, depositTUSDFRAXBPAmount);

  //approve protocol to access borrower wallet
  await TUSD_FRAXBP_LP.connect(borrower.signer).approve(
    convexTUSDFRAXBPVault.address,
    APPROVAL_AMOUNT_LENDING_POOL
  );

  // deposit collateral to borrow
  await convexTUSDFRAXBPVault
    .connect(borrower.signer)
    .depositCollateral(TUSD_FRAXBP_LP.address, depositTUSDFRAXBPAmount);

  await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());
  // process yield, so yield should be sented to YieldManager
  await convexTUSDFRAXBPVault.processYield();
};

const depositUSDC = async (
  testEnv: TestEnv,
  depositor: SignerWithAddress,
  amount: BigNumberish
) => {
  const { pool, usdc } = testEnv;
  const ethers = (DRE as any).ethers;

  const usdcOwnerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
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

  const usdtOwnerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
  await impersonateAccountsHardhat([usdtOwnerAddress]);
  let signer = await ethers.provider.getSigner(usdtOwnerAddress);
  await usdt.connect(signer).transfer(depositor.address, amount);

  //approve protocol to access depositor wallet
  await usdt.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

  //Supplier  deposits 7000 USDT
  await pool.connect(depositor.signer).deposit(usdt.address, amount, depositor.address, '0');
};

const depositDAI = async (testEnv: TestEnv, depositor: SignerWithAddress, amount: BigNumberish) => {
  const { pool, dai } = testEnv;
  const ethers = (DRE as any).ethers;

  const daiOwnerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
  await impersonateAccountsHardhat([daiOwnerAddress]);
  let signer = await ethers.provider.getSigner(daiOwnerAddress);
  await dai.connect(signer).transfer(depositor.address, amount);

  //approve protocol to access depositor wallet
  await dai.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

  //Supplier  deposits
  await pool.connect(depositor.signer).deposit(dai.address, amount, depositor.address, '0');
};

makeSuite('Yield Manger: configuration', (testEnv) => {
  it('Registered reward asset count should be 4', async () => {
    const { yieldManager, usdc, dai } = testEnv;
    const availableAssetCount = 4;
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
  it('WETH should be a reward asset.', async () => {
    const { yieldManager, WETH } = testEnv;
    const assetCount = await yieldManager.getAssetCount();
    let registered = false;
    let index = 0;
    while (assetCount.gt(index)) {
      const assetAddress = await yieldManager.getAssetInfo(index++);
      if (assetAddress.toLowerCase() == WETH.address.toLowerCase()) {
        registered = true;
        break;
      }
    }
    expect(registered).to.be.equal(true);
  });
  it('Should be USDC as an exchange token', async () => {
    const { yieldManager, usdc } = testEnv;
    const asset = await yieldManager._exchangeToken();
    expect(asset).to.be.eq(usdc.address);
  });
  it('Should be failed when set invalid address as an exchange token', async () => {
    const { yieldManager } = testEnv;
    await expect(yieldManager.setExchangeToken(ZERO_ADDRESS)).to.be.reverted;
  });
  it('Should be failed when use invalid address as a curve pool', async () => {
    const { yieldManager, usdc, dai } = testEnv;
    await expect(yieldManager.setCurvePool(usdc.address, dai.address, ZERO_ADDRESS)).to.be.reverted;
  });
  it('All curve pool for USDC -> stable coin should be configured', async () => {
    const { yieldManager, pool, usdc } = testEnv;
    const { 2: assets, 3: length } = await pool.getBorrowingAssetAndVolumes();
    let index = 0;
    while (length.gt(index)) {
      const asset = assets[index++];
      if (asset.toLowerCase() != usdc.address.toLowerCase()) {
        const pool = await yieldManager.getCurvePool(usdc.address, asset);
        expect(pool).to.not.eq(ZERO_ADDRESS);
      }
    }
  });
});

makeSuite('Yield Manager: simulate yield in vaults', (testEnv) => {
  it('Lido vault', async () => {
    const { WETH, yieldManager } = testEnv;
    const beforeBalanceOfWETH = await WETH.balanceOf(yieldManager.address);
    await simulateYieldInLidoVault(testEnv);
    const afterBalanceOfWETH = await WETH.balanceOf(yieldManager.address);
    expect(afterBalanceOfWETH).to.be.gt(beforeBalanceOfWETH);
  });
  it('Convex FRAX vault', async () => {
    const { CRV, CVX, yieldManager, deployer } = testEnv;
    const beforeBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const beforeBalanceOfCVX = await CVX.balanceOf(yieldManager.address);
    await simulateYieldInConvexFRAXVault(testEnv);
    const afterBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const afterBalanceOfCVX = await CRV.balanceOf(yieldManager.address);
    expect(afterBalanceOfCRV).to.be.gt(beforeBalanceOfCRV);
    expect(afterBalanceOfCVX).to.be.gt(beforeBalanceOfCVX);
  });
  // it('Convex DOLA vaults', async () => {
  //   const { CRV, CVX, yieldManager } = testEnv;
  //   const beforeBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
  //   const beforeBalanceOfCVX = await CVX.balanceOf(yieldManager.address);
  //   await simulateYieldInConvexDOLAVault(testEnv);
  //   const afterBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
  //   const afterBalanceOfCVX = await CRV.balanceOf(yieldManager.address);
  //   expect(afterBalanceOfCRV).to.be.gt(beforeBalanceOfCRV);
  //   expect(afterBalanceOfCVX).to.be.gt(beforeBalanceOfCVX);
  // });
  // it('Convex RocketPoolETH vaults', async () => {
  //   const { CRV, CVX, yieldManager } = testEnv;
  //   const beforeBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
  //   const beforeBalanceOfCVX = await CVX.balanceOf(yieldManager.address);
  //   await simulateYieldInConvexRocketPoolETHVault(testEnv);
  //   const afterBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
  //   const afterBalanceOfCVX = await CRV.balanceOf(yieldManager.address);
  //   expect(afterBalanceOfCRV).to.be.gt(beforeBalanceOfCRV);
  //   expect(afterBalanceOfCVX).to.be.gt(beforeBalanceOfCVX);
  // });
});

makeSuite('Yield Manger: distribute yield', (testEnv) => {
  // it('Should be failed when use invalid asset index', async () => {
  //   const { yieldManager, usdc, CRV, CVX } = testEnv;
  //   const assetCount = await yieldManager.getAssetCount();
  //   const paths = [
  //     {
  //       u_path: {
  //         tokens: [CRV.address, usdc.address],
  //         fees: [100],
  //       },
  //       b_path: {
  //         tokens: [],
  //         poolIds: [],
  //       },
  //     },
  //   ];
  //   const slippage = 500;
  //   await expect(yieldManager.distributeYield(assetCount, 1, slippage, paths)).to.be.revertedWith(
  //     '77'
  //   );
  // });
  // it('Should be failed when use invalid swap path', async () => {
  //   const { yieldManager, usdc, CRV, CVX } = testEnv;
  //   const assetCount = 2;
  //   const paths = [
  //     {
  //       u_path: {
  //         tokens: [CRV.address, usdc.address],
  //         fees: [100],
  //       },
  //       b_path: {
  //         tokens: [],
  //         poolIds: [],
  //       },
  //     },
  //   ];
  //   const slippage = 500;
  //   await expect(yieldManager.distributeYield(0, assetCount, slippage, paths)).to.be.revertedWith(
  //     '100'
  //   );
  // });
  it('Should be failed when use swap path including invalid tokens', async () => {
    const { yieldManager, usdc, users } = testEnv;
    const assetCount = 1;
    const paths = [
      {
        u_path: {
          tokens: [usdc.address, usdc.address],
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
    const depositUSDCAmount = await convertToCurrencyDecimals(usdc.address, '7000');
    await depositUSDC(testEnv, depositor1, depositUSDCAmount);

    // Simulate Yield
    await simulateYield(testEnv);

    await expect(yieldManager.distributeYield(0, assetCount, slippage, paths)).to.be.revertedWith(
      '101'
    );
  });
  it('Distribute yield', async () => {
    const {
      yieldManager,
      dai,
      aDai,
      usdc,
      usdt,
      aUsdc,
      aUsdt,
      users,
      CRV,
      CVX,
      BAL,
      WETH,
      aprProvider,
    } = testEnv;

    // suppliers deposit asset to pool
    const depositor1 = users[0];
    const depositor2 = users[1];
    const depositor3 = users[2];
    const depositUSDCAmount = await convertToCurrencyDecimals(usdc.address, '7000');
    const depositUSDTAmount = await convertToCurrencyDecimals(usdt.address, '7000');
    const depositDAIAmount = await convertToCurrencyDecimals(dai.address, '3500');
    await depositUSDC(testEnv, depositor1, depositUSDCAmount);
    await depositDAI(testEnv, depositor2, depositDAIAmount);
    await depositUSDT(testEnv, depositor3, depositUSDTAmount);
    expect((await aUsdc.balanceOf(depositor1.address)).eq(depositUSDCAmount)).to.be.equal(true);
    expect((await aDai.balanceOf(depositor2.address)).eq(depositDAIAmount)).to.be.equal(true);
    expect((await aUsdt.balanceOf(depositor3.address)).eq(depositUSDTAmount)).to.be.equal(true);

    // Simulate Yield
    await simulateYield(testEnv);

    // Distribute yields
    const assetCount = await yieldManager.getAssetCount();
    const paths = [
      {
        u_path: {
          tokens: [CRV.address, WETH.address, usdc.address],
          fees: [10000, 500],
        },
        b_path: {
          tokens: [],
          poolIds: [],
        },
      },
      {
        u_path: {
          tokens: [CVX.address, WETH.address, usdc.address],
          fees: [10000, 500],
        },
        b_path: {
          tokens: [],
          poolIds: [],
        },
      },
      {
        u_path: {
          tokens: [WETH.address, usdc.address],
          fees: [500],
        },
        b_path: {
          tokens: [],
          poolIds: [],
        },
      },
      {
        u_path: {
          tokens: [],
          fees: [],
        },
        b_path: {
          tokens: [BAL.address, WETH.address, usdc.address],
          poolIds: [
            '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014',
            '0x96646936b91d6b9d7d0c47c496afbf3d6ec7b6f8000200000000000000000019',
          ],
        },
      },
    ];
    const slippage = 500;
    await yieldManager.distributeYield(0, assetCount, slippage, paths);

    expect((await aUsdc.balanceOf(depositor1.address)).gt(depositUSDCAmount)).to.be.equal(true);
    expect((await aDai.balanceOf(depositor2.address)).gt(depositDAIAmount)).to.be.equal(true);
    expect((await aUsdt.balanceOf(depositor3.address)).gt(depositUSDTAmount)).to.be.equal(true);
    expect((await aprProvider.APR(usdc.address, true)).gt(0)).to.be.equal(true);
    console.log('APR: ', (Number(await aprProvider.APR(usdc.address, true)) / 1e18) * 100);
  });
});
