/**
 * @dev test for ConvexDAIUSDCUSDTSUSDVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
import { BigNumberish } from 'ethers';
import {
  DRE,
  impersonateAccountsHardhat,
  advanceBlock,
  timeLatest,
} from '../../helpers/misc-utils';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';

// Constant to simulate convex yield, it indicates that time period.
const CONVEX_YIELD_PERIOD = 100000;

// Constants related to asset amount during test
const DEPOSIT_AMOUNT = '3000';
const TRANSFER_ATOKEN_AMOUNT = '1000';
const WITHDRAW_AMOUNT = '2000'; // = deposit - transfer

const prepareCollateralForUser = async (
  testEnv: TestEnv,
  user: SignerWithAddress,
  amount: BigNumberish
) => {
  const { DAI_USDC_USDT_SUSD_LP } = testEnv;
  const ethers = (DRE as any).ethers;

  const LPOwnerAddress = '0x8f649FE750340A295dDdbBd7e1EC8f378cF24b42';
  await impersonateAccountsHardhat([LPOwnerAddress]);
  const signer = await ethers.provider.getSigner(LPOwnerAddress);

  //transfer to borrower
  await DAI_USDC_USDT_SUSD_LP.connect(signer).transfer(user.address, amount);
};

makeSuite('ConvexDAIUSDCUSDTSUSDVault - Deposit & Withdraw', (testEnv: TestEnv) => {
  it('should be reverted if try to use an invalid token as collateral', async () => {
    const { convexDAIUSDCUSDTSUSDVault } = testEnv;
    await expect(convexDAIUSDCUSDTSUSDVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.revertedWith(
      '82'
    );
  });
  it('should be reverted if try to use any of coin other than DAIUSDCUSDTSUSD-f as collateral', async () => {
    const { usdc, convexDAIUSDCUSDTSUSDVault } = testEnv;
    // TODO @bshevchenko: use Error const instead of 82
    await expect(
      convexDAIUSDCUSDTSUSDVault.depositCollateral(usdc.address, 1000)
    ).to.be.revertedWith('82');
  });
  it('deposit DAI-USDC-USDT-SUSD for collateral', async () => {
    const {
      convexDAIUSDCUSDTSUSDVault,
      deployer,
      cvxdai_usdc_usdt_susd,
      aCVXDAI_USDC_USDT_SUSD,
      DAI_USDC_USDT_SUSD_LP,
    } = testEnv;

    // Prepare some DAI_USDC_USDT_SUSD_LP for depositor
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      DAI_USDC_USDT_SUSD_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, deployer, assetAmountToDeposit);

    // allow token transfer to this vault
    await DAI_USDC_USDT_SUSD_LP.connect(deployer.signer).approve(
      convexDAIUSDCUSDTSUSDVault.address,
      assetAmountToDeposit
    );

    // deposit collateral
    await convexDAIUSDCUSDTSUSDVault
      .connect(deployer.signer)
      .depositCollateral(DAI_USDC_USDT_SUSD_LP.address, assetAmountToDeposit);

    expect(await DAI_USDC_USDT_SUSD_LP.balanceOf(deployer.address)).to.be.equal(0);
    expect(await cvxdai_usdc_usdt_susd.balanceOf(convexDAIUSDCUSDTSUSDVault.address)).to.be.equal(
      0
    );
    expect(await aCVXDAI_USDC_USDT_SUSD.balanceOf(convexDAIUSDCUSDTSUSDVault.address)).to.be.equal(
      0
    );
    expect(await aCVXDAI_USDC_USDT_SUSD.balanceOf(deployer.address)).to.be.gte(
      assetAmountToDeposit
    );
  });

  it('transferring aCVXDAI_USDC_USDT_SUSD should be success after deposit DAI_USDC_USDT_SUSD_LP', async () => {
    const { aCVXDAI_USDC_USDT_SUSD, deployer, users } = testEnv;
    await expect(
      aCVXDAI_USDC_USDT_SUSD
        .connect(deployer.signer)
        .transfer(
          users[0].address,
          await convertToCurrencyDecimals(aCVXDAI_USDC_USDT_SUSD.address, TRANSFER_ATOKEN_AMOUNT)
        )
    ).to.not.be.reverted;
  });

  it('withdraw from collateral should be failed if user has not enough balance', async () => {
    const { deployer, convexDAIUSDCUSDTSUSDVault, DAI_USDC_USDT_SUSD_LP } = testEnv;

    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      DAI_USDC_USDT_SUSD_LP.address,
      DEPOSIT_AMOUNT
    );
    await expect(
      convexDAIUSDCUSDTSUSDVault.withdrawCollateral(
        DAI_USDC_USDT_SUSD_LP.address,
        amountAssetToWithdraw,
        9900,
        deployer.address
      )
    ).to.be.reverted;
  });

  it('withdraw from collateral', async () => {
    const { deployer, aCVXDAI_USDC_USDT_SUSD, convexDAIUSDCUSDTSUSDVault, DAI_USDC_USDT_SUSD_LP } =
      testEnv;
    const dola3crvBalanceOfPool = await aCVXDAI_USDC_USDT_SUSD.balanceOf(
      convexDAIUSDCUSDTSUSDVault.address
    );
    const beforeBalanceOfUser = await DAI_USDC_USDT_SUSD_LP.balanceOf(deployer.address);
    // withdraw
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      DAI_USDC_USDT_SUSD_LP.address,
      WITHDRAW_AMOUNT
    );
    await convexDAIUSDCUSDTSUSDVault
      .connect(deployer.signer)
      .withdrawCollateral(
        DAI_USDC_USDT_SUSD_LP.address,
        amountAssetToWithdraw,
        9900,
        deployer.address
      );

    const afterBalanceOfUser = await DAI_USDC_USDT_SUSD_LP.balanceOf(deployer.address);

    expect(dola3crvBalanceOfPool).to.be.equal(0);
    expect(afterBalanceOfUser.sub(beforeBalanceOfUser)).to.be.gte(
      await convertToCurrencyDecimals(DAI_USDC_USDT_SUSD_LP.address, WITHDRAW_AMOUNT)
    );
    expect(await DAI_USDC_USDT_SUSD_LP.balanceOf(convexDAIUSDCUSDTSUSDVault.address)).to.be.equal(
      0
    );
  });
});

makeSuite('convexDAIUSDCUSDTSUSDVault - Process Yield', (testEnv: TestEnv) => {
  it('send yield to YieldManager', async () => {
    const { convexDAIUSDCUSDTSUSDVault, users, DAI_USDC_USDT_SUSD_LP, CRV, CVX, yieldManager } =
      testEnv;
    const borrower = users[1];

    // borrower provides DOLA3CRV
    const assetAmountToDeposit = await convertToCurrencyDecimals(
      DAI_USDC_USDT_SUSD_LP.address,
      DEPOSIT_AMOUNT
    );
    await prepareCollateralForUser(testEnv, borrower, assetAmountToDeposit);
    await DAI_USDC_USDT_SUSD_LP.connect(borrower.signer).approve(
      convexDAIUSDCUSDTSUSDVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );
    await convexDAIUSDCUSDTSUSDVault
      .connect(borrower.signer)
      .depositCollateral(DAI_USDC_USDT_SUSD_LP.address, assetAmountToDeposit);
    expect(await convexDAIUSDCUSDTSUSDVault.getYieldAmount()).to.be.equal(0);
    const beforeBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const beforeBalanceOfCVX = await CVX.balanceOf(yieldManager.address);

    // Simulate yield
    await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());

    // process yield, so all yield should be sent to YieldManager
    await convexDAIUSDCUSDTSUSDVault.processYield();

    const afterBalanceOfCRV = await CRV.balanceOf(yieldManager.address);
    const afterBalanceOfCVX = await CRV.balanceOf(yieldManager.address);
    expect(afterBalanceOfCRV).to.be.gt(beforeBalanceOfCRV);
    expect(afterBalanceOfCVX).to.be.gt(beforeBalanceOfCVX);
  });
});
