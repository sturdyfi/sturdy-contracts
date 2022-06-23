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
import {
  getVariableYieldDistribution,
  getLendingPoolAddressesProvider,
  getMintableERC20,
} from '../../helpers/contracts-getters';
import exp from 'constants';

const chai = require('chai');
const { expect } = chai;
const DISTRIBUTION_DURATION = 86400; //1day

makeSuite('VariableYieldDistribution: configuration', (testEnv) => {
  it('Only EmissionManager can register an asset', async () => {
    const { aCVXFRAX_3CRV, users, convexFRAX3CRVVault, variableYieldDistributor } = testEnv;
    const user = users[2];
    await expect(
      variableYieldDistributor
        .connect(user.signer)
        .registerAsset(aCVXFRAX_3CRV.address, convexFRAX3CRVVault.address)
    ).to.be.revertedWith('104');
  });
  it('Should be reverted if the vault address is invalid', async () => {
    const { aCVXFRAX_3CRV, variableYieldDistributor } = testEnv;

    await expect(variableYieldDistributor.registerAsset(aCVXFRAX_3CRV.address, ZERO_ADDRESS)).to.be
      .reverted;
  });
  it('Should be reverted if the asset is already configured', async () => {
    const { aCVXFRAX_3CRV, convexFRAX3CRVVault, convexMIM3CRVVault, variableYieldDistributor } =
      testEnv;
    await expect(
      variableYieldDistributor.registerAsset(aCVXFRAX_3CRV.address, convexMIM3CRVVault.address)
    ).to.be.revertedWith('106');
  });
});

/**
 * Scenario #1 Description
 *  1. Borrower deposits 10,000 token
 *  2. Some time later, borrower can see his claimalbe rewards using function getRewardsBalance()
 *  3. Borrower can't get any rewards before processYield
 *  3. Borrower can get rewards only after when processYield is executed
 *
 */
makeSuite('VariableYieldDistribution: Scenario #1', (testEnv) => {
  it('Register FRAX3CRV vault', async () => {
    const { aCVXFRAX_3CRV, convexFRAX3CRVVault, CRV, variableYieldDistributor } = testEnv;

    let assetData = await variableYieldDistributor.getAssetData(aCVXFRAX_3CRV.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[1]).to.be.equal(convexFRAX3CRVVault.address); // yield address
    expect(assetData[2]).to.be.equal(CRV.address); // reward token
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('Borrower provides some FRAX3CRV token', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const borrower = users[1];

    let userData = await variableYieldDistributor.getUserAssetData(
      borrower.address,
      aCVXFRAX_3CRV.address
    );
    expect(userData[0]).to.be.equal(0);
    expect(userData[1]).to.be.equal(0);
    expect(userData[2]).to.be.equal(0);

    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';
    const depositFRAX3CRV = '10000';
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

    let assetData = await variableYieldDistributor.getAssetData(aCVXFRAX_3CRV.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
    expect(await aCVXFRAX_3CRV.balanceOf(borrower.address)).to.be.gte(depositFRAX3CRVAmount);
  });
  it('After some time, borrower can see his claimable rewards', async () => {
    const { users, aCVXFRAX_3CRV, CRV, convexFRAX3CRVVault, variableYieldDistributor } = testEnv;
    const borrower = users[1];

    await advanceBlock((await timeLatest()).plus(100000).toNumber());

    const availableAmount = await convexFRAX3CRVVault.getCurrentTotalIncentiveAmount();
    expect(availableAmount).to.be.gt(0);

    await convexFRAX3CRVVault.processYield();

    // fetch available rewards
    const rewardsBalance = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      borrower.address
    );

    expect(rewardsBalance.length).to.be.equal(1);
    expect(rewardsBalance[0].asset).to.be.equal(aCVXFRAX_3CRV.address);
    expect(rewardsBalance[0].rewardToken).to.be.equal(CRV.address);

    const userRewardsBalance = rewardsBalance[0].balance;
    expect(
      availableAmount
        .sub(userRewardsBalance)
        .lt(await convertToCurrencyDecimals(CRV.address, '0.00001'))
    ).to.be.equal(true);
  });
  it('ClaimRewards: should be failed when use invalid address as an receiver address', async () => {
    const { users, aCVXFRAX_3CRV, CRV, variableYieldDistributor } = testEnv;
    const borrower = users[1];

    const result = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      borrower.address
    );
    expect(result[0].balance).to.be.gt(0);

    await expect(
      variableYieldDistributor
        .connect(borrower.signer)
        .claimRewards(aCVXFRAX_3CRV.address, result[0].balance, ZERO_ADDRESS)
    ).to.be.reverted;
  });
  // it('ClaimRewards: borrower can not get any rewards before processYield', async () => {
  //   const { users, aCVXFRAX_3CRV, CRV, variableYieldDistributor } = testEnv;
  //   const borrower = users[1];
  //   const result = await variableYieldDistributor.getRewardsBalance(
  //     [aCVXFRAX_3CRV.address],
  //     borrower.address
  //   );
  //   expect(result[0].rewardToken).to.be.equal(CRV.address);
  //   expect(result[0].balance).to.be.gt(0);

  //   let crvBalanceOfUser = await CRV.balanceOf(borrower.address);
  //   expect(crvBalanceOfUser).to.be.eq(0);

  //   await variableYieldDistributor
  //     .connect(borrower.signer)
  //     .claimRewards(aCVXFRAX_3CRV.address, result[0].balance, borrower.address);

  //   crvBalanceOfUser = await CRV.balanceOf(borrower.address);
  //   expect(crvBalanceOfUser).to.be.equal(0);
  // });
  it('ClaimRewards: borrower can get rewards', async () => {
    const { users, aCVXFRAX_3CRV, CRV, variableYieldDistributor, convexFRAX3CRVVault } = testEnv;
    const borrower = users[1];
    const result = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      borrower.address
    );
    expect(result[0].rewardToken).to.be.equal(CRV.address);
    const availableRewards = result[0].balance;
    expect(availableRewards).to.be.gt(0);

    let crvBalanceOfUser = await CRV.balanceOf(borrower.address);
    expect(crvBalanceOfUser).to.be.eq(0);

    await variableYieldDistributor
      .connect(borrower.signer)
      .claimRewards(aCVXFRAX_3CRV.address, availableRewards, borrower.address);

    crvBalanceOfUser = await CRV.balanceOf(borrower.address);
    expect(crvBalanceOfUser).to.be.eq(availableRewards);
  });
});

/**
 * Scenario #2 Description
 *  1. User1 deposits 2,000 token
 *  2. The next day, User2 deposits twice the amount of User1
 *  3. The second day, User1 & User2 requests claim
 *
 * Expected: the available rewards amount should be the same for both.
 */
makeSuite('VariableYieldDistribution: Senario #2', (testEnv) => {
  it('User1 deposits 2,000 FRAX3CRV', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    let userData = await variableYieldDistributor.getUserAssetData(
      user1.address,
      aCVXFRAX_3CRV.address
    );
    expect(userData[0]).to.be.equal(0);
    expect(userData[1]).to.be.equal(0);
    expect(userData[2]).to.be.equal(0);

    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';
    const depositFRAX3CRV = '2000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(user1.address, depositFRAX3CRVAmount);
    await FRAX_3CRV_LP.connect(user1.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexFRAX3CRVVault
      .connect(user1.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXFRAX_3CRV.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('After one day, User2 deposits 4,000 FRAX3CRV', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    let userData = await variableYieldDistributor.getUserAssetData(
      user2.address,
      aCVXFRAX_3CRV.address
    );
    expect(userData[0]).to.be.equal(0);
    expect(userData[1]).to.be.equal(0);
    expect(userData[2]).to.be.equal(0);

    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';
    const depositFRAX3CRV = '4000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(user2.address, depositFRAX3CRVAmount);
    await FRAX_3CRV_LP.connect(user2.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexFRAX3CRVVault
      .connect(user2.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXFRAX_3CRV.address);
    expect(assetData[0]).to.be.gt(0); // index
    expect(assetData[3]).to.be.gt(0); // last available rewards
  });
  it('After one day pass again, the rewards amount should be the same for both.', async () => {
    const { users, aCVXFRAX_3CRV, CRV, variableYieldDistributor } = testEnv;
    const user1 = users[1];
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    let result = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      user1.address
    );

    const amountForUser1 = result[0].balance;

    result = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      user2.address
    );

    const amountForUser2 = result[0].balance;

    expect(
      amountForUser1
        .sub(amountForUser2)
        .abs()
        .lt(await convertToCurrencyDecimals(CRV.address, '0.00001'))
    ).to.be.equal(true);
  });
});

/**
 * Scenario #3 Description
 *  1. User1 deposits 4,000 token
 *  2. The next day, User1 withdraws 4,000 token
 *  3. User2 deposits 4,000 token on the same day
 *  4. One day later, User1 & User2 request claim
 *
 * Expected: the available rewards amount should be the same for both.
 */
makeSuite('VariableYieldDistribution: Scenario #3', (testEnv) => {
  it('User1 deposits 4,000 FRAX3CRV', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    let userData = await variableYieldDistributor.getUserAssetData(
      user1.address,
      aCVXFRAX_3CRV.address
    );
    expect(userData[0]).to.be.equal(0);
    expect(userData[1]).to.be.equal(0);
    expect(userData[2]).to.be.equal(0);

    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';
    const depositFRAX3CRV = '4000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(user1.address, depositFRAX3CRVAmount);
    await FRAX_3CRV_LP.connect(user1.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexFRAX3CRVVault
      .connect(user1.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXFRAX_3CRV.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('After one day, User1 withdraws 4,000 FRAX3CRV', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const user1 = users[1];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    const depositFRAX3CRV = '4000';
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await expect(
      convexFRAX3CRVVault
        .connect(user1.signer)
        .withdrawCollateral(FRAX_3CRV_LP.address, amountAssetToWithdraw, 100, user1.address)
    ).to.not.be.reverted;
  });
  it('User1 can see his claimable rewards.', async () => {
    const { users, aCVXFRAX_3CRV, CRV, convexFRAX3CRVVault, variableYieldDistributor } = testEnv;
    const user1 = users[1];

    await convexFRAX3CRVVault.processYield();

    // fetch available rewards
    const result = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      user1.address
    );

    // claimableAmount > 0
    const claimableAmount = result[0].balance;
    expect(claimableAmount).to.be.gt(0);
  });
  it('On the same day, User2 deposits 4,000 FRAX3CRV', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user2 = users[2];

    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';
    const depositFRAX3CRV = '4000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(user2.address, depositFRAX3CRVAmount);
    await FRAX_3CRV_LP.connect(user2.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexFRAX3CRVVault
      .connect(user2.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);
  });
  it('After one day pass again, the rewards amount should be the same for both.', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, CRV, variableYieldDistributor } = testEnv;
    const user1 = users[1];
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());
    await convexFRAX3CRVVault.processYield();

    let result = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      user1.address
    );

    const amountForUser1 = result[0].balance;

    result = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      user2.address
    );

    const amountForUser2 = result[0].balance;

    expect(
      amountForUser1
        .sub(amountForUser2)
        .abs()
        .lt(await convertToCurrencyDecimals(CRV.address, '0.00001'))
    ).to.be.equal(true);
  });
});

/**
 * Scenario #4 Description
 *  1. User1 deposits 1,000 token
 *  2. The next day, User2 deposits 5,000 token
 *  3. The second day, User2 withdraws 5,000 token
 *  4. On the same day, someone executes processYield
 *  5. The third day, User1 deosits 1,000 token again
 *  6. The fourth day, User1 & User2 requests claim
 *  *
 * Expected: the available rewards amount should be the same for both.
 */
makeSuite('VariableYieldDistribution: Scenario #4', (testEnv) => {
  it('User1 deposits 1,000 FRAX3CRV', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';
    const depositFRAX3CRV = '1000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(user1.address, depositFRAX3CRVAmount);
    await FRAX_3CRV_LP.connect(user1.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexFRAX3CRVVault
      .connect(user1.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXFRAX_3CRV.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('The next day, User2 deposits 5,000 FRAX3CRV', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';
    const depositFRAX3CRV = '5000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(user2.address, depositFRAX3CRVAmount);
    await FRAX_3CRV_LP.connect(user2.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexFRAX3CRVVault
      .connect(user2.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXFRAX_3CRV.address);
    expect(assetData[0]).to.be.gt(0); // index
    expect(assetData[3]).to.be.gt(0); // last available rewards
  });
  it('The second day, User2 withdraws 5,000 FRAX3CRV', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    const depositFRAX3CRV = '5000';
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await expect(
      convexFRAX3CRVVault
        .connect(user2.signer)
        .withdrawCollateral(FRAX_3CRV_LP.address, amountAssetToWithdraw, 100, user2.address)
    ).to.not.be.reverted;
  });
  it('The same day, someone executes processYield.', async () => {
    const { CRV, convexFRAX3CRVVault, variableYieldDistributor } = testEnv;

    const beforeBalance = await CRV.balanceOf(variableYieldDistributor.address);

    await convexFRAX3CRVVault.processYield();

    const afterBalance = await CRV.balanceOf(variableYieldDistributor.address);

    expect(afterBalance.sub(beforeBalance)).to.be.gt(0);
  });
  it('The 3rd day, User1 deposits 1,000 FRAX3CRV', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';
    const depositFRAX3CRV = '1000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(user1.address, depositFRAX3CRVAmount);
    await FRAX_3CRV_LP.connect(user1.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexFRAX3CRVVault
      .connect(user1.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);
  });
  it('The 4th day, the rewards amount should be the same for both.', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, CRV, variableYieldDistributor } = testEnv;
    const user1 = users[1];
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());
    await convexFRAX3CRVVault.processYield();

    let result = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      user1.address
    );

    const amountForUser1 = result[0].balance;

    result = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      user2.address
    );

    const amountForUser2 = result[0].balance;

    expect(
      amountForUser1
        .sub(amountForUser2)
        .abs()
        .lt(await convertToCurrencyDecimals(CRV.address, '0.00001'))
    ).to.be.equal(true);
  });
});

/**
 * Scenario #5 Description
 *  1. User1 deposits 1,000 token
 *  2. The next day, someone execute processYield, and User1 takes the half of his rewards
 *  3. The 2nd day, User1 queries his claimalbe rewards, and deposits again 2,000 token
 *  4. The 3rd day, User1 withdraw 1,000 token, and User2 deposits 5,000 token
 *  5. The 4th day, someone execute processYield
 *  6. User1 takes all available rewards.
 *  *
 * Expected: User1 should be available to take all amount from getRewardsBalance()
 */
makeSuite('VariableYieldDistribution: Scenario #5', (testEnv) => {
  it('User1 deposits 1,000 FRAX3CRV', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';
    const depositFRAX3CRV = '1000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(user1.address, depositFRAX3CRVAmount);
    await FRAX_3CRV_LP.connect(user1.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexFRAX3CRVVault
      .connect(user1.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXFRAX_3CRV.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('The next day, execute processYield and User1 takes the half of his rewards', async () => {
    const { users, CRV, aCVXFRAX_3CRV, convexFRAX3CRVVault, variableYieldDistributor } = testEnv;
    const user1 = users[1];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    // processYield
    let beforeBalance = await CRV.balanceOf(variableYieldDistributor.address);
    await convexFRAX3CRVVault.processYield();
    let afterBalance = await CRV.balanceOf(variableYieldDistributor.address);
    const receivedAmount = afterBalance.sub(beforeBalance);
    expect(receivedAmount).to.be.gt(0);

    let response = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      user1.address
    );
    const availableRewards = response[0].balance;

    expect(
      receivedAmount
        .sub(availableRewards)
        .abs()
        .lte(await convertToCurrencyDecimals(CRV.address, '0.00001'))
    ).to.be.equal(true);

    beforeBalance = await CRV.balanceOf(user1.address);
    const claimAmount = availableRewards.div(2);
    await variableYieldDistributor
      .connect(user1.signer)
      .claimRewards(aCVXFRAX_3CRV.address, claimAmount, user1.address);
    afterBalance = await CRV.balanceOf(user1.address);
    expect(afterBalance.sub(beforeBalance).sub(claimAmount)).to.be.equal(0);
  });
  it('The 2nd day, User1 queries his claimalbe rewards, and deposits again 2,000', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    // queries his claimable rewards
    const response = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      user1.address
    );
    const rewardsAmount = response[0].balance;
    expect(rewardsAmount).to.be.gt(0);

    // deposits again
    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';
    const depositFRAX3CRV = '2000';
    const depositFRAX3CRVAmount = await convertToCurrencyDecimals(
      FRAX_3CRV_LP.address,
      depositFRAX3CRV
    );

    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(user1.address, depositFRAX3CRVAmount);
    await FRAX_3CRV_LP.connect(user1.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    await convexFRAX3CRVVault
      .connect(user1.signer)
      .depositCollateral(FRAX_3CRV_LP.address, depositFRAX3CRVAmount);
  });
  it('The 3rd day, User1 withdraw 1,000 token, and User2 deposits 5,000', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];
    const user2 = users[2];
    const FRAX3CRVLPOwnerAddress = '0xc5d3d004a223299c4f95bb702534c14a32e8778c';

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    // User1 withdraws
    let amountAsset = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '1000');
    await expect(
      convexFRAX3CRVVault
        .connect(user1.signer)
        .withdrawCollateral(FRAX_3CRV_LP.address, amountAsset, 100, user2.address)
    ).to.not.be.reverted;

    // User2 deposits
    amountAsset = await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '5000');
    await impersonateAccountsHardhat([FRAX3CRVLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(FRAX3CRVLPOwnerAddress);
    await FRAX_3CRV_LP.connect(signer).transfer(user2.address, amountAsset);
    await FRAX_3CRV_LP.connect(user2.signer).approve(
      convexFRAX3CRVVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    await expect(
      convexFRAX3CRVVault.connect(user2.signer).depositCollateral(FRAX_3CRV_LP.address, amountAsset)
    ).to.not.be.reverted;
  });
  it('The 4th day, someone execute processYield', async () => {
    const { CRV, convexFRAX3CRVVault, variableYieldDistributor } = testEnv;

    const beforeBalance = await CRV.balanceOf(variableYieldDistributor.address);

    await convexFRAX3CRVVault.processYield();

    const afterBalance = await CRV.balanceOf(variableYieldDistributor.address);

    expect(afterBalance.sub(beforeBalance)).to.be.gt(0);
  });
  it('User1 takes all available rewards.', async () => {
    const { users, aCVXFRAX_3CRV, CRV, variableYieldDistributor } = testEnv;
    const user1 = users[1];

    let response = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      user1.address
    );
    const availableRewards = response[0].balance;

    const beforeBalance = await CRV.balanceOf(user1.address);
    await variableYieldDistributor
      .connect(user1.signer)
      .claimRewards(aCVXFRAX_3CRV.address, availableRewards, user1.address);
    const afterBalance = await CRV.balanceOf(user1.address);
    expect(afterBalance.sub(beforeBalance).sub(availableRewards)).to.be.equal(0);
  });
});
