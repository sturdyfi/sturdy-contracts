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

const getPoolAdmin = async () => {
  const ethers = (DRE as any).ethers;
  const addressProvider = await getLendingPoolAddressesProvider();
  const admin = await addressProvider.getPoolAdmin();
  await impersonateAccountsHardhat([admin]);
  let signer = await ethers.provider.getSigner(admin);
  return {
    address: admin,
    signer: signer,
  };
};

makeSuite('VariableYieldDistribution: configuration', (testEnv) => {
  it('Only Pool Admin can register an asset', async () => {
    const { aCVXFRAX_3CRV, users, convexFRAX3CRVVault, variableYieldDistributor } = testEnv;
    const user = users[2];
    await expect(
      variableYieldDistributor
        .connect(user.signer)
        .registerAsset(aCVXFRAX_3CRV.address, convexFRAX3CRVVault.address)
    ).to.be.revertedWith('33');
  });
  it('Should be reverted if the vault address is invalid', async () => {
    const { aCVXFRAX_3CRV, variableYieldDistributor } = testEnv;
    const poolAdmin = await getPoolAdmin();

    await expect(
      variableYieldDistributor
        .connect(poolAdmin.signer)
        .registerAsset(aCVXFRAX_3CRV.address, ZERO_ADDRESS)
    ).to.be.reverted;
  });
  it('Should be reverted if the asset is already configured', async () => {
    const { aCVXFRAX_3CRV, convexFRAX3CRVVault, convexMIM3CRVVault, variableYieldDistributor } =
      testEnv;
    const poolAdmin = await getPoolAdmin();
    await variableYieldDistributor
      .connect(poolAdmin.signer)
      .registerAsset(aCVXFRAX_3CRV.address, convexFRAX3CRVVault.address);
    await expect(
      variableYieldDistributor
        .connect(poolAdmin.signer)
        .registerAsset(aCVXFRAX_3CRV.address, convexMIM3CRVVault.address)
    ).to.be.revertedWith('106');
  });
});

makeSuite('VariableYieldDistribution', (testEnv) => {
  it('Register FRAX3CRV vault', async () => {
    const { aCVXFRAX_3CRV, convexFRAX3CRVVault, CRV, variableYieldDistributor } = testEnv;
    const poolAdmin = await getPoolAdmin();

    await convexFRAX3CRVVault.setIncentiveRatio('3000'); // 30%

    await expect(
      variableYieldDistributor
        .connect(poolAdmin.signer)
        .registerAsset(aCVXFRAX_3CRV.address, convexFRAX3CRVVault.address)
    ).to.not.be.reverted;

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
  it('ClaimRewards: borrower can not get any rewards before processYield', async () => {
    const { users, aCVXFRAX_3CRV, CRV, variableYieldDistributor } = testEnv;
    const borrower = users[1];
    const result = await variableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      borrower.address
    );
    expect(result[0].rewardToken).to.be.equal(CRV.address);
    expect(result[0].balance).to.be.gt(0);

    let crvBalanceOfUser = await CRV.balanceOf(borrower.address);
    expect(crvBalanceOfUser).to.be.eq(0);

    await variableYieldDistributor
      .connect(borrower.signer)
      .claimRewards(aCVXFRAX_3CRV.address, result[0].balance, borrower.address);

    crvBalanceOfUser = await CRV.balanceOf(borrower.address);
    expect(crvBalanceOfUser).to.be.equal(0);
  });
  it('ClaimRewards: borrower can get rewards after processYield', async () => {
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

    await convexFRAX3CRVVault.processYield();

    await variableYieldDistributor
      .connect(borrower.signer)
      .claimRewards(aCVXFRAX_3CRV.address, availableRewards, borrower.address);

    crvBalanceOfUser = await CRV.balanceOf(borrower.address);
    expect(crvBalanceOfUser).to.be.eq(availableRewards);
  });
});
