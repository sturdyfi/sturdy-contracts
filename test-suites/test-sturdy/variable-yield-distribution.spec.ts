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
    const { aCVXFRAX_3CRV, users, convexFRAX3CRVVault } = testEnv;
    const VariableYieldDistributor = await getVariableYieldDistribution();
    const user = users[2];
    await expect(
      VariableYieldDistributor.connect(user.signer).registerAsset(
        aCVXFRAX_3CRV.address,
        convexFRAX3CRVVault.address
      )
    ).to.be.revertedWith('33');
  });
  it('Should be reverted if the vault address is invalid', async () => {
    const { aCVXFRAX_3CRV } = testEnv;
    const poolAdmin = await getPoolAdmin();

    const VariableYieldDistributor = await getVariableYieldDistribution();
    await expect(
      VariableYieldDistributor.connect(poolAdmin.signer).registerAsset(
        aCVXFRAX_3CRV.address,
        ZERO_ADDRESS
      )
    ).to.be.reverted;
  });
  it('Should be reverted if the asset is already configured', async () => {
    const { aCVXFRAX_3CRV, convexFRAX3CRVVault, convexMIM3CRVVault } = testEnv;
    const poolAdmin = await getPoolAdmin();
    const VariableYieldDistributor = await getVariableYieldDistribution();
    await VariableYieldDistributor.connect(poolAdmin.signer).registerAsset(
      aCVXFRAX_3CRV.address,
      convexFRAX3CRVVault.address
    );
    await expect(
      VariableYieldDistributor.connect(poolAdmin.signer).registerAsset(
        aCVXFRAX_3CRV.address,
        convexMIM3CRVVault.address
      )
    ).to.be.revertedWith('106');
  });
});

makeSuite('VariableYieldDistribution', (testEnv) => {
  it('Register FRAX3CRV vault', async () => {
    const { aCVXFRAX_3CRV, convexFRAX3CRVVault, CRV } = testEnv;
    const poolAdmin = await getPoolAdmin();
    const VariableYieldDistributor = await getVariableYieldDistribution();

    await convexFRAX3CRVVault.setIncentiveRatio('3000'); // 30%

    await expect(
      VariableYieldDistributor.connect(poolAdmin.signer).registerAsset(
        aCVXFRAX_3CRV.address,
        convexFRAX3CRVVault.address
      )
    ).to.not.be.reverted;

    let assetData = await VariableYieldDistributor.getAssetData(aCVXFRAX_3CRV.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[1]).to.be.equal(convexFRAX3CRVVault.address); // yield address
    expect(assetData[2]).to.be.equal(CRV.address); // reward token
    expect(assetData[3]).to.be.equal(0); // last available rewards
  });
  it('Borrower provides some FRAX3CRV token', async () => {
    const { users, aCVXFRAX_3CRV, convexFRAX3CRVVault, FRAX_3CRV_LP } = testEnv;
    const ethers = (DRE as any).ethers;
    const borrower = users[1];
    const VariableYieldDistributor = await getVariableYieldDistribution();

    let userData = await VariableYieldDistributor.getUserAssetData(
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

    let assetData = await VariableYieldDistributor.getAssetData(aCVXFRAX_3CRV.address);
    expect(assetData[0]).to.be.equal(0); // index
    expect(assetData[3]).to.be.equal(0); // last available rewards
    expect(await aCVXFRAX_3CRV.balanceOf(borrower.address)).to.be.gte(depositFRAX3CRVAmount);
  });
  it('After some later, borrower can see his claimable rewards', async () => {
    const { users, aCVXFRAX_3CRV, CRV, convexFRAX3CRVVault } = testEnv;
    const VariableYieldDistributor = await getVariableYieldDistribution();
    const borrower = users[1];

    let balanceOfUser = await aCVXFRAX_3CRV.balanceOf(borrower.address);
    console.log('Balance:', balanceOfUser.toString());

    await advanceBlock((await timeLatest()).plus(100000).toNumber());

    const amount = await convexFRAX3CRVVault.getCurrentTotalIncentiveAmount();
    console.log('Available Amount:', amount.toString());
    expect(amount).to.be.gt(0);

    // fetch available rewards
    const rewardsBalance = await VariableYieldDistributor.getRewardsBalance(
      [aCVXFRAX_3CRV.address],
      borrower.address
    );

    const result = await aCVXFRAX_3CRV.getScaledUserBalanceAndSupply(borrower.address);
    balanceOfUser = result[0];
    const totalSupply = result[1];

    console.log('Balance:', balanceOfUser.toString());
    console.log('Total Supply:', totalSupply.toString());

    expect(rewardsBalance.length).to.be.equal(1);
    expect(rewardsBalance[0].asset).to.be.equal(aCVXFRAX_3CRV.address);
    expect(rewardsBalance[0].rewardToken).to.be.equal(CRV.address);
    console.log('User Claimable Amount:', rewardsBalance[0].balance.toString());
    expect(rewardsBalance[0].balance).to.be.gt(0);
  });
});
