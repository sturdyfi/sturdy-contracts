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

const chai = require('chai');
const { expect } = chai;
const DISTRIBUTION_DURATION = 86400; //1day

makeSuite('Check LDO token growing ', (testEnv) => {
  it('User deposits FRAX_3CRV_LP as collateral', async () => {
    const { aCVXFRAX_3CRV, users, convexFRAX3CRVVault, FRAX_3CRV_LP } = testEnv;
    const ethers = (DRE as any).ethers;
    const depositor = users[0];
    printDivider();

    // Prepare FRAX_3CRV_LP
    const assetAmountToDeposit = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '3000');
    const LPOwnerAddress = '0x005fb56Fe0401a4017e6f046272dA922BBf8dF06';
    await impersonateAccountsHardhat([LPOwnerAddress]);
    let signer = await ethers.provider.getSigner(LPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(depositor.address, assetAmountToDeposit);

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
      [aCVXFRAX_3CRV.address],
      depositor.address
    );
    let depositorLDOBefore = await LDO.balanceOf(depositor.address);
    expect(unclaimedDepositorRewardsBefore.toString()).to.be.bignumber.equal('0');
    expect(depositorLDOBefore.toString()).to.be.bignumber.equal('0');

    //user 2 deposits 3000 FRAX_3CRV_LP
    await FRAX_3CRV_LP.connect(depositor.signer).approve(
      convexFRAX3CRVVault.address,
      assetAmountToDeposit
    );
    await convexFRAX3CRVVault
      .connect(depositor.signer)
      .depositCollateral(FRAX_3CRV_LP.address, assetAmountToDeposit);

    await advanceBlock((await timeLatest()).plus(100).toNumber());
    unclaimedDepositorRewardsBefore = await LDOStableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      depositor.address
    );
    depositorLDOBefore = await LDO.balanceOf(depositor.address);

    expect(unclaimedDepositorRewardsBefore.toString()).to.be.bignumber.equal('999');
    expect(depositorLDOBefore.toString()).to.be.bignumber.equal('0');

    //claim rewards of depositor
    await LDOStableYieldDistributor.connect(depositor.signer).claimRewards(
      [aCVXFRAX_3CRV.address],
      100,
      depositor.address
    );

    let unclaimedDepositorRewardsAfter = await LDOStableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      depositor.address
    );
    let depositorLDOAfter = await LDO.balanceOf(depositor.address);
    expect(unclaimedDepositorRewardsAfter.toString()).to.be.bignumber.lte('929');
    expect(unclaimedDepositorRewardsAfter.toString()).to.be.bignumber.gte('909');
    expect(depositorLDOAfter.toString()).to.be.bignumber.equal('100');
  });
});
