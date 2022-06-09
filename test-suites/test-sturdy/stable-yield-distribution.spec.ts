import BigNumber from 'bignumber.js';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite } from './helpers/make-suite';
import { RateMode } from '../../helpers/types';
import { printUserAccountData, ETHfromWei, printDivider } from './helpers/utils/helpers';
import {
  advanceBlock,
  DRE,
  impersonateAccountsHardhat,
  timeLatest,
  waitForTx,
} from '../../helpers/misc-utils';
import { IERC20DetailedFactory } from '../../types/IERC20DetailedFactory';
import { getFXSStableYieldDistribution, getMintableERC20 } from '../../helpers/contracts-getters';

const chai = require('chai');
const { expect } = chai;
const DISTRIBUTION_DURATION = 86400; //1day

makeSuite('Check FXS token growing ', (testEnv) => {
  it('User deposits FRAX_3CRV_LP as collateral', async () => {
    const { aCVXFRAX_3CRV, users, convexFRAX3CRVVault, FRAX_3CRV_LP } = testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    printDivider();

    // Prepare FRAX_3CRV_LP
    const assetAmountToDeposit = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '3000');
    const LPOwnerAddress = '0xccf6c29d87eb2c0bafede74f5df35f84541f4549';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(depositor.address, assetAmountToDeposit);

    // Deposit FXS to StableYieldDistributor
    const FXSStableYieldDistributor = await getFXSStableYieldDistribution();
    const FXS = await getMintableERC20('0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0');
    const FXSOwnerAddress = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
    await impersonateAccountsHardhat([FXSOwnerAddress]);
    signer = await ethers.provider.getSigner(FXSOwnerAddress);
    const amountFXStoDeposit = await convertToCurrencyDecimals(FXS.address, '10000');
    await FXS.connect(signer).transfer(FXSStableYieldDistributor.address, amountFXStoDeposit);

    await FXSStableYieldDistributor.setDistributionEnd(
      (await timeLatest()).plus(DISTRIBUTION_DURATION).toString()
    );
    await advanceBlock((await timeLatest()).plus(100).toNumber());

    let unclaimedDepositorRewardsBefore = await FXSStableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      depositor.address
    );
    let depositorFXSBefore = await FXS.balanceOf(depositor.address);
    expect(unclaimedDepositorRewardsBefore.toString()).to.be.bignumber.equal('0');
    expect(depositorFXSBefore.toString()).to.be.bignumber.equal('0');

    //user 2 deposits 3000 FRAX_3CRV_LP
    await FRAX_3CRV_LP.connect(depositor.signer).approve(
      convexFRAX3CRVVault.address,
      assetAmountToDeposit
    );
    await convexFRAX3CRVVault
      .connect(depositor.signer)
      .depositCollateral(FRAX_3CRV_LP.address, assetAmountToDeposit);

    await advanceBlock((await timeLatest()).plus(100).toNumber());
    unclaimedDepositorRewardsBefore = await FXSStableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      depositor.address
    );
    depositorFXSBefore = await FXS.balanceOf(depositor.address);

    expect(unclaimedDepositorRewardsBefore.toString()).to.be.bignumber.equal('999');
    expect(depositorFXSBefore.toString()).to.be.bignumber.equal('0');

    //claim rewards of depositor
    await FXSStableYieldDistributor.connect(depositor.signer).claimRewards(
      [aCVXFRAX_3CRV.address],
      100,
      depositor.address
    );

    let unclaimedDepositorRewardsAfter = await FXSStableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      depositor.address
    );
    let depositorFXSAfter = await FXS.balanceOf(depositor.address);
    expect(unclaimedDepositorRewardsAfter.toString()).to.be.bignumber.equal('909');
    expect(depositorFXSAfter.toString()).to.be.bignumber.equal('100');
  });
});
