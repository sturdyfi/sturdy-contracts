import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite } from './helpers/make-suite';
import { printDivider } from './helpers/utils/helpers';
import {
  advanceBlock,
  DRE,
  impersonateAccountsHardhat,
  timeLatest,
} from '../../helpers/misc-utils';
import { getLDOStableYieldDistribution, getMintableERC20 } from '../../helpers/contracts-getters';
import BigNumber from 'bignumber.js';
import { RateMode } from '../../helpers/types';

const chai = require('chai');
const { expect } = chai;
const DISTRIBUTION_DURATION = 86400; //1day

makeSuite('Check LDO token growing ', (testEnv) => {
  it('User deposits WETH', async () => {
    const { aWeth, users, pool, weth } = testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    printDivider();

    // Prepare WETH
    const assetAmountToDeposit = await convertToCurrencyDecimals(weth.address, '10');
    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    await impersonateAccountsHardhat([wethOwnerAddress]);
    let signer = await ethers.provider.getSigner(wethOwnerAddress);
    await weth.connect(signer).transfer(depositor.address, assetAmountToDeposit);

    // Deposit LDO to StableYieldDistributor
    const LDOStableYieldDistributor = await getLDOStableYieldDistribution();
    const LDO = await getMintableERC20('0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32');
    const LDOOwnerAddress = '0xAD4f7415407B83a081A0Bee22D05A8FDC18B42da';
    await impersonateAccountsHardhat([LDOOwnerAddress]);
    signer = await ethers.provider.getSigner(LDOOwnerAddress);
    const amountLDOtoDeposit = await convertToCurrencyDecimals(LDO.address, '10000');
    await LDO.connect(signer).transfer(LDOStableYieldDistributor.address, amountLDOtoDeposit);

    await LDOStableYieldDistributor.setDistributionEnd(
      (await timeLatest()).plus(DISTRIBUTION_DURATION).toString()
    );
    await advanceBlock((await timeLatest()).plus(100).toNumber());

    let unclaimedDepositorRewardsBefore = await LDOStableYieldDistributor.getRewardsBalance(
      [aWeth.address],
      depositor.address
    );
    let depositorLDOBefore = await LDO.balanceOf(depositor.address);
    expect(unclaimedDepositorRewardsBefore.toString()).to.be.bignumber.equal('0');
    expect(depositorLDOBefore.toString()).to.be.bignumber.equal('0');

    //user deposits 10 WETH
    await weth.connect(depositor.signer).approve(
      pool.address,
      assetAmountToDeposit
    );
    await pool
      .connect(depositor.signer)
      .deposit(weth.address, assetAmountToDeposit, depositor.address, '0');

    await advanceBlock((await timeLatest()).plus(100).toNumber());
    unclaimedDepositorRewardsBefore = await LDOStableYieldDistributor.getRewardsBalance(
      [aWeth.address],
      depositor.address
    );
    depositorLDOBefore = await LDO.balanceOf(depositor.address);

    expect(unclaimedDepositorRewardsBefore.toString()).to.be.bignumber.equal('1000');
    expect(depositorLDOBefore.toString()).to.be.bignumber.equal('0');

    //claim rewards of depositor
    await LDOStableYieldDistributor.connect(depositor.signer).claimRewards(
      [aWeth.address],
      100,
      depositor.address
    );

    let unclaimedDepositorRewardsAfter = await LDOStableYieldDistributor.getRewardsBalance(
      [aWeth.address],
      depositor.address
    );
    let depositorLDOAfter = await LDO.balanceOf(depositor.address);
    expect(unclaimedDepositorRewardsAfter.toString()).to.be.bignumber.lte('920');
    expect(unclaimedDepositorRewardsAfter.toString()).to.be.bignumber.gte('910');
    expect(depositorLDOAfter.toString()).to.be.bignumber.equal('100');
  });
});

makeSuite('Check LDO token not growing ', (testEnv) => {
  it('User deposits ETH_STETH_LP as collateral', async () => {
    const { aCVXETH_STETH, users, convexETHSTETHVault, ETH_STETH_LP, pool, oracle, weth, helpersContract } = testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    const borrower = users[1];
    printDivider();

    // Prepare WETH
    let assetAmountToDeposit = await convertToCurrencyDecimals(weth.address, '10');
    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    await impersonateAccountsHardhat([wethOwnerAddress]);
    let signer = await ethers.provider.getSigner(wethOwnerAddress);
    await weth.connect(signer).transfer(depositor.address, assetAmountToDeposit);

    //user deposits 10 WETH
    await weth.connect(depositor.signer).approve(
      pool.address,
      assetAmountToDeposit
    );
    await pool
      .connect(depositor.signer)
      .deposit(weth.address, assetAmountToDeposit, depositor.address, '0');

    // Prepare ETH_STETH_LP
    assetAmountToDeposit = await convertToCurrencyDecimals(ETH_STETH_LP.address, '2');
    const LPOwnerAddress = '0x43378368D84D4bA00D1C8E97EC2E6016A82fC062';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    signer = await ethers.provider.getSigner(LPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(borrower.address, assetAmountToDeposit);

    // Deposit LDO to StableYieldDistributor
    const LDOStableYieldDistributor = await getLDOStableYieldDistribution();
    const LDO = await getMintableERC20('0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32');
    const LDOOwnerAddress = '0xAD4f7415407B83a081A0Bee22D05A8FDC18B42da';
    await impersonateAccountsHardhat([LDOOwnerAddress]);
    signer = await ethers.provider.getSigner(LDOOwnerAddress);
    const amountLDOtoDeposit = await convertToCurrencyDecimals(LDO.address, '10000');
    await LDO.connect(signer).transfer(LDOStableYieldDistributor.address, amountLDOtoDeposit);

    await LDOStableYieldDistributor.setDistributionEnd(
      (await timeLatest()).plus(DISTRIBUTION_DURATION).toString()
    );
    await advanceBlock((await timeLatest()).plus(100).toNumber());

    let unclaimedDepositorRewardsBefore = await LDOStableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      borrower.address
    );
    let borrowerLDOBefore = await LDO.balanceOf(borrower.address);
    expect(unclaimedDepositorRewardsBefore.toString()).to.be.bignumber.equal('0');
    expect(borrowerLDOBefore.toString()).to.be.bignumber.equal('0');

    //borrower deposits 2 ETH_STETH_LP as collateral
    await ETH_STETH_LP.connect(borrower.signer).approve(
      convexETHSTETHVault.address,
      assetAmountToDeposit
    );
    await convexETHSTETHVault
      .connect(borrower.signer)
      .depositCollateral(ETH_STETH_LP.address, assetAmountToDeposit);

    await advanceBlock((await timeLatest()).plus(100).toNumber());
    unclaimedDepositorRewardsBefore = await LDOStableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      borrower.address
    );
    borrowerLDOBefore = await LDO.balanceOf(borrower.address);

    expect(unclaimedDepositorRewardsBefore.toString()).to.be.bignumber.equal('0');
    expect(borrowerLDOBefore.toString()).to.be.bignumber.equal('0');

    //borrow
    const userGlobalData = await pool.getUserAccountData(borrower.address);
    const wethPrice = await oracle.getAssetPrice(weth.address);

    const amountWETHToBorrow = await convertToCurrencyDecimals(
      weth.address,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(wethPrice.toString())
        .multipliedBy(0.95)
        .toFixed(5)
    );

    await pool
      .connect(borrower.signer)
      .borrow(weth.address, amountWETHToBorrow, RateMode.Variable, '0', borrower.address);
    
    await advanceBlock((await timeLatest()).plus(100).toNumber());
    const wethDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(weth.address))
    .variableDebtTokenAddress;
    unclaimedDepositorRewardsBefore = await LDOStableYieldDistributor.getRewardsBalance(
      [wethDebtTokenAddress],
      borrower.address
    );
    borrowerLDOBefore = await LDO.balanceOf(borrower.address);

    expect(unclaimedDepositorRewardsBefore.toString()).to.be.bignumber.equal('0');
    expect(borrowerLDOBefore.toString()).to.be.bignumber.equal('0');
  });
});
