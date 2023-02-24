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
} from '../../helpers/misc-utils';

const chai = require('chai');
const { expect } = chai;

makeSuite('VariableYieldDistribution: configuration', (testEnv) => {
  it('Only EmissionManager can register an asset', async () => {
    const { aCVXETH_STETH, users, convexETHSTETHVault, variableYieldDistributor } = testEnv;
    const user = users[2];
    await expect(
      variableYieldDistributor
        .connect(user.signer)
        .registerAsset(aCVXETH_STETH.address, convexETHSTETHVault.address)
    ).to.be.revertedWith('104');
  });
  it('Should be reverted if the vault address is invalid', async () => {
    const { aCVXETH_STETH, variableYieldDistributor } = testEnv;

    await expect(variableYieldDistributor.registerAsset(aCVXETH_STETH.address, ZERO_ADDRESS)).to.be
      .reverted;
  });
  it('Should be reverted if the asset is already configured', async () => {
    const { aCVXETH_STETH, convexETHSTETHVault, variableYieldDistributor } =
      testEnv;
    await expect(
      variableYieldDistributor.registerAsset(aCVXETH_STETH.address, convexETHSTETHVault.address)
    ).to.be.revertedWith('106');
  });
});

/**
 * Scenario #1 Description
 *  1. Borrower deposits 10 token
 *  2. Some time later, borrower can see his claimalbe rewards using function getRewardsBalance()
 *  3. Borrower can't get any rewards before processYield
 *  3. Borrower can get rewards only after when processYield is executed
 *
 */
makeSuite('VariableYieldDistribution: Scenario #1', (testEnv) => {
  it('Register ETHSTETH vault', async () => {
    const { aCVXETH_STETH, convexETHSTETHVault, CRV, variableYieldDistributor } = testEnv;

    let assetData = await variableYieldDistributor.getAssetData(aCVXETH_STETH.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[1]).to.be.equal(convexETHSTETHVault.address); // yield address
    expect(assetData[2]).to.be.equal(CRV.address); // reward token
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('Borrower provides some ETHSTETH token', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const borrower = users[1];

    let userData = await variableYieldDistributor.getUserAssetData(
      borrower.address,
      aCVXETH_STETH.address
    );
    expect(userData[0]).to.be.equal(0);
    expect(userData[1]).to.be.equal(0);
    expect(userData[2]).to.be.equal(0);

    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '10';
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

    let assetData = await variableYieldDistributor.getAssetData(aCVXETH_STETH.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
    expect(await aCVXETH_STETH.balanceOf(borrower.address)).to.be.gte(depositETHSTETHAmount);
  });
  it('After some time, borrower can see his claimable rewards', async () => {
    const { users, aCVXETH_STETH, CRV, convexETHSTETHVault, variableYieldDistributor } = testEnv;
    const borrower = users[1];

    await advanceBlock((await timeLatest()).plus(100).toNumber());

    const availableAmount = await convexETHSTETHVault.getCurrentTotalIncentiveAmount();
    expect(availableAmount).to.be.gte(0);

    await convexETHSTETHVault.processYield();

    // fetch available rewards
    const rewardsBalance = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      borrower.address
    );

    expect(rewardsBalance.length).to.be.equal(1);
    expect(rewardsBalance[0].asset).to.be.equal(aCVXETH_STETH.address);
    expect(rewardsBalance[0].rewardToken).to.be.equal(CRV.address);

    const userRewardsBalance = rewardsBalance[0].balance;
    expect(
      availableAmount
        .sub(userRewardsBalance)
        .lt(await convertToCurrencyDecimals(CRV.address, '0.00001'))
    ).to.be.equal(true);
  });
  it('ClaimRewards: should be failed when use invalid address as an receiver address', async () => {
    const { users, aCVXETH_STETH, CRV, variableYieldDistributor } = testEnv;
    const borrower = users[1];

    const result = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      borrower.address
    );
    expect(result[0].balance).to.be.gte(0);

    await expect(
      variableYieldDistributor
        .connect(borrower.signer)
        .claimRewards([aCVXETH_STETH.address], [result[0].balance], ZERO_ADDRESS)
    ).to.be.reverted;
  });
  // it('ClaimRewards: borrower can not get any rewards before processYield', async () => {
  //   const { users, aCVXETH_STETH, CRV, variableYieldDistributor } = testEnv;
  //   const borrower = users[1];
  //   const result = await variableYieldDistributor.getRewardsBalance(
  //     [aCVXETH_STETH.address],
  //     borrower.address
  //   );
  //   expect(result[0].rewardToken).to.be.equal(CRV.address);
  //   expect(result[0].balance).to.be.gt(0);

  //   let crvBalanceOfUser = await CRV.balanceOf(borrower.address);
  //   expect(crvBalanceOfUser).to.be.eq(0);

  //   await variableYieldDistributor
  //     .connect(borrower.signer)
  //     .claimRewards([aCVXETH_STETH.address], [result[0].balance], borrower.address);

  //   crvBalanceOfUser = await CRV.balanceOf(borrower.address);
  //   expect(crvBalanceOfUser).to.be.equal(0);
  // });
  it('ClaimRewards: borrower can get rewards', async () => {
    const { users, aCVXETH_STETH, CRV, variableYieldDistributor, convexETHSTETHVault } = testEnv;
    const borrower = users[1];
    const result = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      borrower.address
    );
    expect(result[0].rewardToken).to.be.equal(CRV.address);
    const availableRewards = result[0].balance;
    expect(availableRewards).to.be.gte(0);

    let crvBalanceOfUser = await CRV.balanceOf(borrower.address);
    expect(crvBalanceOfUser).to.be.eq(0);

    await variableYieldDistributor
      .connect(borrower.signer)
      .claimRewards([aCVXETH_STETH.address], [availableRewards], borrower.address);

    crvBalanceOfUser = await CRV.balanceOf(borrower.address);
    expect(crvBalanceOfUser).to.be.eq(availableRewards);
  });
});

/**
 * Scenario #2 Description
 *  1. User1 deposits 2 token
 *  2. The next day, User2 deposits twice the amount of User1
 *  3. The second day, User1 & User2 requests claim
 *
 * Expected: the available rewards amount should be the same for both.
 */
makeSuite('VariableYieldDistribution: Senario #2', (testEnv) => {
  it('User1 deposits 2 ETHSTETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    let userData = await variableYieldDistributor.getUserAssetData(
      user1.address,
      aCVXETH_STETH.address
    );
    expect(userData[0]).to.be.equal(0);
    expect(userData[1]).to.be.equal(0);
    expect(userData[2]).to.be.equal(0);

    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '2';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user1.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user1.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexETHSTETHVault
      .connect(user1.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXETH_STETH.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('After one day, User2 deposits 4 ETHSTETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    let userData = await variableYieldDistributor.getUserAssetData(
      user2.address,
      aCVXETH_STETH.address
    );
    expect(userData[0]).to.be.equal(0);
    expect(userData[1]).to.be.equal(0);
    expect(userData[2]).to.be.equal(0);

    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '4';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user2.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user2.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexETHSTETHVault
      .connect(user2.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXETH_STETH.address);
    expect(assetData[0]).to.be.gte(0); // index
    expect(assetData[3]).to.be.gte(0); // last available rewards
  });
  it('After one day pass again, the rewards amount should be the same for both.', async () => {
    const { users, aCVXETH_STETH, CRV, variableYieldDistributor } = testEnv;
    const user1 = users[1];
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    let result = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      user1.address
    );

    const amountForUser1 = result[0].balance;

    result = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
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
 *  1. User1 deposits 4 token
 *  2. The next day, User1 withdraws 4 token
 *  3. User2 deposits 4 token on the same day
 *  4. One day later, User1 & User2 request claim
 *
 * Expected: the available rewards amount should be the same for both.
 */
makeSuite('VariableYieldDistribution: Scenario #3', (testEnv) => {
  it('User1 deposits 4 ETHSTETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    let userData = await variableYieldDistributor.getUserAssetData(
      user1.address,
      aCVXETH_STETH.address
    );
    expect(userData[0]).to.be.equal(0);
    expect(userData[1]).to.be.equal(0);
    expect(userData[2]).to.be.equal(0);

    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '4';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user1.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user1.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexETHSTETHVault
      .connect(user1.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXETH_STETH.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('After one day, User1 withdraws 4 ETHSTETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const user1 = users[1];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    const depositETHSTETH = '4';
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await expect(
      convexETHSTETHVault
        .connect(user1.signer)
        .withdrawCollateral(ETH_STETH_LP.address, amountAssetToWithdraw, 100, user1.address)
    ).to.not.be.reverted;
  });
  it('User1 can see his claimable rewards.', async () => {
    const { users, aCVXETH_STETH, CRV, convexETHSTETHVault, variableYieldDistributor } = testEnv;
    const user1 = users[1];

    await convexETHSTETHVault.processYield();

    // fetch available rewards
    const result = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      user1.address
    );

    // claimableAmount > 0
    const claimableAmount = result[0].balance;
    expect(claimableAmount).to.be.gte(0);
  });
  it('On the same day, User2 deposits 4 ETHSTETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user2 = users[2];

    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '4';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user2.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user2.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexETHSTETHVault
      .connect(user2.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);
  });
  it('After one day pass again, the rewards amount should be the same for both.', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, CRV, variableYieldDistributor } = testEnv;
    const user1 = users[1];
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());
    await convexETHSTETHVault.processYield();

    let result = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      user1.address
    );

    const amountForUser1 = result[0].balance;

    result = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
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
 *  1. User1 deposits 1 token
 *  2. The next day, User2 deposits 5 token
 *  3. The second day, User2 withdraws 5 token
 *  4. On the same day, someone executes processYield
 *  5. The third day, User1 deosits 1 token again
 *  6. The fourth day, User1 & User2 requests claim
 *  *
 * Expected: the available rewards amount should be the same for both.
 */
makeSuite('VariableYieldDistribution: Scenario #4', (testEnv) => {
  it('User1 deposits 1 ETHSTETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '1';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user1.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user1.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexETHSTETHVault
      .connect(user1.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXETH_STETH.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('The next day, User2 deposits 5 ETHSTETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '5';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user2.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user2.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexETHSTETHVault
      .connect(user2.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXETH_STETH.address);
    expect(assetData[0]).to.be.gte(0); // index
    expect(assetData[3]).to.be.gte(0); // last available rewards
  });
  it('The second day, User2 withdraws 5 ETHSTETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    const depositETHSTETH = '5';
    const amountAssetToWithdraw = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await expect(
      convexETHSTETHVault
        .connect(user2.signer)
        .withdrawCollateral(ETH_STETH_LP.address, amountAssetToWithdraw, 100, user2.address)
    ).to.not.be.reverted;
  });
  it('The same day, someone executes processYield.', async () => {
    const { CRV, convexETHSTETHVault, variableYieldDistributor } = testEnv;

    const beforeBalance = await CRV.balanceOf(variableYieldDistributor.address);

    await convexETHSTETHVault.processYield();

    const afterBalance = await CRV.balanceOf(variableYieldDistributor.address);

    expect(afterBalance.sub(beforeBalance)).to.be.gte(0);
  });
  it('The 3rd day, User1 deposits 1 ETHSTETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '1';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user1.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user1.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexETHSTETHVault
      .connect(user1.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);
  });
  it('The 4th day, the rewards amount should be the same for both.', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, CRV, variableYieldDistributor } = testEnv;
    const user1 = users[1];
    const user2 = users[2];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());
    await convexETHSTETHVault.processYield();

    let result = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      user1.address
    );

    const amountForUser1 = result[0].balance;

    result = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
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
 *  1. User1 deposits 1 token
 *  2. The next day, someone execute processYield, and User1 takes the half of his rewards
 *  3. The 2nd day, User1 queries his claimalbe rewards, and deposits again 2 token
 *  4. The 3rd day, User1 withdraw 1 token, and User2 deposits 5 token
 *  5. The 4th day, someone execute processYield
 *  6. User1 takes all available rewards.
 *  *
 * Expected: User1 should be available to take all amount from getRewardsBalance()
 */
makeSuite('VariableYieldDistribution: Scenario #5', (testEnv) => {
  it('User1 deposits 1 ETHSTETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '1';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user1.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user1.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexETHSTETHVault
      .connect(user1.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXETH_STETH.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('The next day, execute processYield and User1 takes the half of his rewards', async () => {
    const { users, CRV, aCVXETH_STETH, convexETHSTETHVault, variableYieldDistributor } = testEnv;
    const user1 = users[1];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    // processYield
    let beforeBalance = await CRV.balanceOf(variableYieldDistributor.address);
    await convexETHSTETHVault.processYield();
    let afterBalance = await CRV.balanceOf(variableYieldDistributor.address);
    const receivedAmount = afterBalance.sub(beforeBalance);
    expect(receivedAmount).to.be.gte(0);

    let response = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
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
      .claimRewards([aCVXETH_STETH.address], [claimAmount], user1.address);
    afterBalance = await CRV.balanceOf(user1.address);
    expect(afterBalance.sub(beforeBalance).sub(claimAmount)).to.be.equal(0);
  });
  it('The 2nd day, User1 queries his claimalbe rewards, and deposits again 2', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    // queries his claimable rewards
    const response = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      user1.address
    );
    const rewardsAmount = response[0].balance;
    expect(rewardsAmount).to.be.gte(0);

    // deposits again
    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '2';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user1.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user1.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    await convexETHSTETHVault
      .connect(user1.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);
  });
  it('The 3rd day, User1 withdraw 1 token, and User2 deposits 5', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];
    const user2 = users[2];
    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    // User1 withdraws
    let amountAsset = await convertToCurrencyDecimals(ETH_STETH_LP.address, '1');
    await expect(
      convexETHSTETHVault
        .connect(user1.signer)
        .withdrawCollateral(ETH_STETH_LP.address, amountAsset, 100, user2.address)
    ).to.not.be.reverted;

    // User2 deposits
    amountAsset = await convertToCurrencyDecimals(ETH_STETH_LP.address, '5');
    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user2.address, amountAsset);
    await ETH_STETH_LP.connect(user2.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    await expect(
      convexETHSTETHVault.connect(user2.signer).depositCollateral(ETH_STETH_LP.address, amountAsset)
    ).to.not.be.reverted;
  });
  it('The 4th day, someone execute processYield', async () => {
    const { CRV, convexETHSTETHVault, variableYieldDistributor } = testEnv;

    const beforeBalance = await CRV.balanceOf(variableYieldDistributor.address);

    await convexETHSTETHVault.processYield();

    const afterBalance = await CRV.balanceOf(variableYieldDistributor.address);

    expect(afterBalance.sub(beforeBalance)).to.be.gte(0);
  });
  it('User1 takes all available rewards.', async () => {
    const { users, aCVXETH_STETH, CRV, variableYieldDistributor } = testEnv;
    const user1 = users[1];

    let response = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      user1.address
    );
    const availableRewards = response[0].balance;

    const beforeBalance = await CRV.balanceOf(user1.address);
    await variableYieldDistributor
      .connect(user1.signer)
      .claimRewards([aCVXETH_STETH.address], [availableRewards], user1.address);
    const afterBalance = await CRV.balanceOf(user1.address);
    expect(afterBalance.sub(beforeBalance).sub(availableRewards)).to.be.equal(0);
  });
});

/**
 * Scenario #6 Description
 *  1. User1 deposits 1 token
 *  2. The next day, someone execute processYield, and User1 takes the half of his rewards
 *  3. The 2nd day, User1 queries his claimalbe rewards, and deposits again 2 token
 *  4. The 3rd day, User1 withdraw 1 token, and User2 deposits 5 token
 *  5. The 4th day, someone execute processYield
 *  6. User1 takes all available rewards.
 *  *
 * Expected: User1 should be available to take all amount from getRewardsBalance()
 */
makeSuite('VariableYieldDistribution: Scenario #6', (testEnv) => {
  it('User1 deposits 1 ETH_STETH', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '1';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user1.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user1.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    // deposit collateral to borrow
    await convexETHSTETHVault
      .connect(user1.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);

    let assetData = await variableYieldDistributor.getAssetData(aCVXETH_STETH.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('The next day, execute processYield and User1 takes the half of his rewards', async () => {
    const { users, CRV, aCVXETH_STETH, convexETHSTETHVault, variableYieldDistributor } = testEnv;
    const user1 = users[1];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    // processYield
    let beforeBalance = await CRV.balanceOf(variableYieldDistributor.address);
    await convexETHSTETHVault.processYield();
    let afterBalance = await CRV.balanceOf(variableYieldDistributor.address);
    const receivedAmount = afterBalance.sub(beforeBalance);
    expect(receivedAmount).to.be.gte(0);

    let response = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
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
      .claimRewards([aCVXETH_STETH.address], [claimAmount], user1.address);
    afterBalance = await CRV.balanceOf(user1.address);
    expect(afterBalance.sub(beforeBalance).sub(claimAmount)).to.be.equal(0);
  });
  it('The 2nd day, User1 queries his claimalbe rewards, and deposits again 2', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    // queries his claimable rewards
    const response = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      user1.address
    );
    const rewardsAmount = response[0].balance;
    expect(rewardsAmount).to.be.gte(0);

    // deposits again
    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';
    const depositETHSTETH = '2';
    const depositETHSTETHAmount = await convertToCurrencyDecimals(
      ETH_STETH_LP.address,
      depositETHSTETH
    );

    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user1.address, depositETHSTETHAmount);
    await ETH_STETH_LP.connect(user1.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    await convexETHSTETHVault
      .connect(user1.signer)
      .depositCollateral(ETH_STETH_LP.address, depositETHSTETHAmount);
  });
  it('The 3rd day, User1 withdraw 1 token, and User2 deposits 5', async () => {
    const { users, aCVXETH_STETH, convexETHSTETHVault, ETH_STETH_LP, variableYieldDistributor } =
      testEnv;
    const ethers = (DRE as any).ethers;
    const user1 = users[1];
    const user2 = users[2];
    const ETHSTETHLPOwnerAddress = '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A';

    await advanceBlock((await timeLatest()).plus(86400).toNumber());

    // User1 withdraws
    let amountAsset = await convertToCurrencyDecimals(ETH_STETH_LP.address, '1');
    await expect(
      convexETHSTETHVault
        .connect(user1.signer)
        .withdrawCollateral(ETH_STETH_LP.address, amountAsset, 100, user2.address)
    ).to.not.be.reverted;

    // User2 deposits
    amountAsset = await convertToCurrencyDecimals(ETH_STETH_LP.address, '5');
    await impersonateAccountsHardhat([ETHSTETHLPOwnerAddress]);
    let signer = await ethers.provider.getSigner(ETHSTETHLPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user2.address, amountAsset);
    await ETH_STETH_LP.connect(user2.signer).approve(
      convexETHSTETHVault.address,
      APPROVAL_AMOUNT_LENDING_POOL
    );

    await expect(
      convexETHSTETHVault.connect(user2.signer).depositCollateral(ETH_STETH_LP.address, amountAsset)
    ).to.not.be.reverted;
  });
  it('The 4th day, someone execute processYield', async () => {
    const { CRV, convexETHSTETHVault, variableYieldDistributor } = testEnv;

    const beforeBalance = await CRV.balanceOf(variableYieldDistributor.address);

    await convexETHSTETHVault.processYield();

    const afterBalance = await CRV.balanceOf(variableYieldDistributor.address);

    expect(afterBalance.sub(beforeBalance)).to.be.gte(0);
  });
  it('User1 takes all available rewards.', async () => {
    const { users, aCVXETH_STETH, CRV, variableYieldDistributor } = testEnv;
    const user1 = users[1];

    let response = await variableYieldDistributor.getRewardsBalance(
      [aCVXETH_STETH.address],
      user1.address
    );
    const availableRewards = response[0].balance;

    const beforeBalance = await CRV.balanceOf(user1.address);
    await variableYieldDistributor
      .connect(user1.signer)
      .claimRewards([aCVXETH_STETH.address], [availableRewards], user1.address);
    const afterBalance = await CRV.balanceOf(user1.address);
    expect(afterBalance.sub(beforeBalance).sub(availableRewards)).to.be.equal(0);
  });
});
