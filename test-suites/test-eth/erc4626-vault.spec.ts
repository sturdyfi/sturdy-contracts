import { makeSuite } from './helpers/make-suite';
import { mint } from './helpers/mint';
import { deployERC4626Vault } from '../../helpers/contracts-deployments';
import { ERC4626Vault } from '../../types';
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../../helpers/constants';
import { parseEther } from 'ethers/lib/utils';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { BigNumber, BigNumberish } from 'ethers';
import { isSimilar } from './helpers/almost-equal';

const chai = require('chai');
const { expect } = chai;

makeSuite('ERC4626-WETH - Configuration', (testEnv) => {
  let erc4626Vault: ERC4626Vault;

  before(async () => {
    // deploy WETH ERC4626 contract
    const { weth, aWeth, pool } = testEnv;

    erc4626Vault = await deployERC4626Vault([
      weth.address,
      aWeth.address,
      pool.address
    ], 'WETH');
  });

  it('check decimals, symbol, name, asset, aToken', async () => {
    const { weth, aWeth } = testEnv;
    
    expect(await erc4626Vault.decimals()).to.be.eq(18);
    expect(await erc4626Vault.symbol()).to.be.eq('ws2WETH');
    expect(await erc4626Vault.name()).to.be.eq('ERC4626-Wrapped Sturdy WETH');
    expect(await erc4626Vault.asset()).to.be.eq(weth.address);
    expect(await erc4626Vault.aToken()).to.be.eq(aWeth.address);
  });

  it('check maxDeposit, maxMint', async () => {
    const { weth, configurator } = testEnv;

    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);

    // Freeze WETH
    await configurator.freezeReserve(weth.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq('0');
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq('0');

    // UnFreeze WETH
    await configurator.unfreezeReserve(weth.address);
    // Deactivate WETH
    await configurator.deactivateReserve(weth.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq('0');
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq('0');

    // activate WETH
    await configurator.activateReserve(weth.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
  });

  it('check maxWithdraw, maxRedeem', async () => {
    const { weth, configurator, users } = testEnv;
    const user = users[0];
    
    // User Deposit 10 WETH
    const assetAmount = parseEther('10').toString();
    await mint('WETH', assetAmount, user);
    await weth.connect(user.signer).approve(erc4626Vault.address, assetAmount);
    await erc4626Vault.connect(user.signer).deposit(assetAmount, user.address);

    expect(await erc4626Vault.maxWithdraw(user.address)).to.be.eq(assetAmount);
    expect(await erc4626Vault.maxRedeem(user.address)).to.be.eq(assetAmount);

    // Freeze WETH
    await configurator.freezeReserve(weth.address);
    expect(await erc4626Vault.maxWithdraw(user.address)).to.be.eq(assetAmount);
    expect(await erc4626Vault.maxRedeem(user.address)).to.be.eq(assetAmount);

    // UnFreeze WETH
    await configurator.unfreezeReserve(weth.address);
  });
});

// Scenario:
// A = Alice, B = Bob
//  ________________________________________________________
// | Vault shares | A share | A assets | B share | B assets |
// |========================================================|
// | 1. Alice mints 2000 shares (costs 2000 tokens)         |
// |--------------|---------|----------|---------|----------|
// |         2000 |    2000 |     2000 |       0 |        0 |
// |--------------|---------|----------|---------|----------|
// | 2. Bob deposits 4000 tokens (mints 4000 shares)        |
// |--------------|---------|----------|---------|----------|
// |         6000 |    2000 |     2000 |    4000 |     4000 |
// |--------------|---------|----------|---------|----------|
// | 3. Vault mutates by +3000 tokens...                    |
// |    (simulated yield returned from strategy)...         |
// |--------------|---------|----------|---------|----------|
// |         6000 |    2000 |     3000 |    4000 |     6000 |
// |--------------|---------|----------|---------|----------|
// | 4. Alice deposits 2000 tokens (mints 1333 shares)      |
// |--------------|---------|----------|---------|----------|
// |         7333 |    3333 |     4999 |    4000 |     6000 |
// |--------------|---------|----------|---------|----------|
// | 5. Bob mints 2000 shares (costs 3001 assets)           |
// |    NOTE: Bob's assets spent got rounded up             |
// |    NOTE: Alice's vault assets got rounded up           |
// |--------------|---------|----------|---------|----------|
// |         9333 |    3333 |     5000 |    6000 |     9000 |
// |--------------|---------|----------|---------|----------|
// | 6. Vault mutates by +3000 tokens...                    |
// |    (simulated yield returned from strategy)            |
// |    NOTE: Vault holds 17001 tokens, but sum of          |
// |          assetsOf() is 17000.                          |
// |--------------|---------|----------|---------|----------|
// |         9333 |    3333 |     6071 |    6000 |    10929 |
// |--------------|---------|----------|---------|----------|
// | 7. Alice redeem 1333 shares (2428 assets)              |
// |--------------|---------|----------|---------|----------|
// |         8000 |    2000 |     3643 |    6000 |    10929 |
// |--------------|---------|----------|---------|----------|
// | 8. Bob withdraws 2928 assets (1608 shares)             |
// |--------------|---------|----------|---------|----------|
// |         6392 |    2000 |     3643 |    4392 |     8000 |
// |--------------|---------|----------|---------|----------|
// | 9. Alice withdraws 3643 assets (2000 shares)           |
// |    NOTE: Bob's assets have been rounded back up        |
// |--------------|---------|----------|---------|----------|
// |         4392 |       0 |        0 |    4392 |     8001 |
// |--------------|---------|----------|---------|----------|
// | 10. Bob redeem 4392 shares (8001 tokens)               |
// |--------------|---------|----------|---------|----------|
// |            0 |       0 |        0 |       0 |        0 |
// |______________|_________|__________|_________|__________|

makeSuite('ERC4626-WETH - Scenario Test', (testEnv) => {
  let erc4626Vault: ERC4626Vault;
  let AAssetAmount: BigNumber;
  let AShareAmount: BigNumber;
  let BAssetAmount: BigNumber;
  let BShareAmount: BigNumber;
  let preMutationShareBal: BigNumber;
  let preMutationBal: BigNumber;
  let mutationAssetAmount: BigNumber;
  const shareDecimal = 18;

  before(async () => {
    // deploy WETH ERC4626 contract
    const { weth, aWeth, pool, users } = testEnv;
    const A = users[0];
    const B = users[1];

    erc4626Vault = await deployERC4626Vault([
      weth.address,
      aWeth.address,
      pool.address
    ], 'WETH');

    // Prepare Enough WETH for A(alice) and B(bob)
    await mint('WETH', parseEther('4000').toString(), A);
    await mint('WETH', parseEther('7001').toString(), B);

    // Approve vault
    await weth.connect(A.signer).approve(erc4626Vault.address, parseEther('4000'));
    await weth.connect(B.signer).approve(erc4626Vault.address, parseEther('7001'));
  });

  it('1. Alice mints 2000 shares (costs 2000 tokens)', async () => {
    const { users } = testEnv;
    const A = users[0];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2000');
    
    await erc4626Vault.connect(A.signer).mint(shareAmount, A.address);
    const ABalance = await erc4626Vault.balanceOf(A.address);
    AAssetAmount = await erc4626Vault.previewRedeem(shareAmount);
    AShareAmount = await erc4626Vault.previewDeposit(AAssetAmount)
    
    // Expect to have received the requested mint amount.
    expect(isSimilar(AShareAmount, shareAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, AShareAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), AAssetAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToShares(AAssetAmount), ABalance, shareDecimal)).to.be.eq(true);

    // Expect a 1:1 ratio before mutation.
    expect(isSimilar(AAssetAmount, shareAmount, shareDecimal)).to.be.eq(true);

    // Sanity check.
    expect(isSimilar(await erc4626Vault.totalSupply(), AShareAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), AAssetAmount, shareDecimal)).to.be.eq(true);
  });

  it('2. Bob deposits 4000 tokens (mints 4000 shares)', async () => {
    const { users } = testEnv;
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    
    await erc4626Vault.connect(B.signer).deposit(assetAmount, B.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    BShareAmount = await erc4626Vault.previewWithdraw(assetAmount);
    BAssetAmount = await erc4626Vault.previewMint(BShareAmount)
    
    // Expect to have received the requested underlying amount.
    expect(isSimilar(BAssetAmount, assetAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, BShareAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), BAssetAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToShares(BAssetAmount), BBalance, shareDecimal)).to.be.eq(true);

    // Expect a 1:1 ratio before mutation.
    expect(isSimilar(BShareAmount, BAssetAmount, shareDecimal)).to.be.eq(true);

    // Sanity check.
    const totalAmount = await convertToCurrencyDecimals(erc4626Vault.address, '6000');
    preMutationShareBal = AShareAmount.add(BShareAmount);
    preMutationBal = AAssetAmount.add(BAssetAmount);

    expect(isSimilar(await erc4626Vault.totalSupply(), preMutationShareBal, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), preMutationBal, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalSupply(), totalAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), totalAmount, shareDecimal)).to.be.eq(true);
  });

  it('3. Vault mutates by +3000 tokens... ', async () => {
    const { pool, deployer, weth, users, configurator } = testEnv;
    const A = users[0];
    const B = users[1];

    //    (simulated yield returned from strategy)...
    // The Vault now contains more tokens than deposited which causes the exchange rate to change.
    // A(alice) share is 33.33% of the Vault, B(bob) 66.66% of the Vault.
    // A's share count stays the same but the underlying amount changes from 2000 to 3000.
    // B's share count stays the same but the underlying amount changes from 4000 to 6000.
    mutationAssetAmount = parseEther('3000');
    await mint('WETH', mutationAssetAmount.toString(), deployer);
    await weth.approve(pool.address, mutationAssetAmount);
    await configurator.registerVault(deployer.address);
    await pool.depositYield(weth.address, mutationAssetAmount);

    expect(isSimilar(await erc4626Vault.totalSupply(), preMutationShareBal, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), preMutationBal.add(mutationAssetAmount), shareDecimal)).to.be.eq(true);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(ABalance, AShareAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), AAssetAmount.add(mutationAssetAmount.div(3)), shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, BShareAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), BAssetAmount.add(mutationAssetAmount.div(3).mul(2)), shareDecimal)).to.be.eq(true);

  });

  it('4. Alice deposits 2000 tokens (mints 1333 shares)', async () => {
    const { users } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = parseEther('2000');
    
    await erc4626Vault.connect(A.signer).deposit(assetAmount, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(await erc4626Vault.totalSupply(), await convertToCurrencyDecimals(erc4626Vault.address, '7333'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, await convertToCurrencyDecimals(erc4626Vault.address, '3333'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), parseEther('4999'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, await convertToCurrencyDecimals(erc4626Vault.address, '4000'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), parseEther('6000'), shareDecimal)).to.be.eq(true);
  });

  it('5. Bob mints 2000 shares (costs 3001 assets)', async () => {
    const { users, weth } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2000');

    // NOTE: B's assets spent got rounded up
    // NOTE: A's vault assets got rounded up
    await erc4626Vault.connect(B.signer).mint(shareAmount, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(await erc4626Vault.totalSupply(), await convertToCurrencyDecimals(erc4626Vault.address, '9333'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, await convertToCurrencyDecimals(erc4626Vault.address, '3333'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), parseEther('5000'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, await convertToCurrencyDecimals(erc4626Vault.address, '6000'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), parseEther('9000'), shareDecimal)).to.be.eq(true);

    // Sanity checks:
    // A and B should have spent all their tokens now
    expect(isSimilar(await weth.balanceOf(A.address), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await weth.balanceOf(B.address), 0, shareDecimal)).to.be.eq(true);
    // Assets in vault: 4k (alice) + 7k (bob) + 3k (yield) + 1 (round up)
    expect(isSimilar(await erc4626Vault.totalAssets(), parseEther('14001'), shareDecimal)).to.be.eq(true);
  });

  it('6. Vault mutates by +3000 tokens', async () => {
    const { pool, deployer, weth, users } = testEnv;
    const A = users[0];
    const B = users[1];

    // NOTE: Vault holds 17001 tokens, but sum of assetsOf() is 17000.
    await mint('WETH', mutationAssetAmount.toString(), deployer);
    await weth.approve(pool.address, mutationAssetAmount);
    await pool.depositYield(weth.address, mutationAssetAmount);

    expect(isSimilar(await erc4626Vault.totalAssets(), parseEther('17001'), shareDecimal)).to.be.eq(true);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), parseEther('6071'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), parseEther('10929'), shareDecimal)).to.be.eq(true);
  });

  it('7. Alice redeem 1333 shares (2428 assets)', async () => {
    const { users, weth } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '1333');

    await erc4626Vault.connect(A.signer).redeem(shareAmount, A.address, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(await weth.balanceOf(A.address), parseEther('2428'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalSupply(), await convertToCurrencyDecimals(erc4626Vault.address, '8000'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), parseEther('14573'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, await convertToCurrencyDecimals(erc4626Vault.address, '2000'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), parseEther('3643'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, await convertToCurrencyDecimals(erc4626Vault.address, '6000'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), parseEther('10929'), shareDecimal)).to.be.eq(true);
  });

  it('8. Bob withdraws 2929 assets (1608 shares)', async () => {
    const { users, weth } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2929');

    await erc4626Vault.connect(B.signer).withdraw(assetAmount, B.address, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(await weth.balanceOf(B.address), parseEther('2929'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalSupply(), await convertToCurrencyDecimals(erc4626Vault.address, '6392'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), parseEther('11644'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, await convertToCurrencyDecimals(erc4626Vault.address, '2000'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), parseEther('3643'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, await convertToCurrencyDecimals(erc4626Vault.address, '4392'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), parseEther('8000'), shareDecimal)).to.be.eq(true);
  });

  it('9. Alice withdraws 3643 assets (2000 shares)', async () => {
    const { users, weth } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(erc4626Vault.address, '3643');

    await erc4626Vault.connect(A.signer).withdraw(assetAmount, A.address, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(await weth.balanceOf(A.address), parseEther('6071'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalSupply(), await convertToCurrencyDecimals(erc4626Vault.address, '4392'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), parseEther('8001'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, await convertToCurrencyDecimals(erc4626Vault.address, '4392'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), parseEther('8000'), shareDecimal)).to.be.eq(true);
  });

  it('10. Bob redeem 4392 shares (8001 tokens)', async () => {
    const { users, weth } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4391.8');

    await erc4626Vault.connect(B.signer).redeem(shareAmount, B.address, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(await weth.balanceOf(B.address), parseEther('10929'), shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalSupply(), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), 0, shareDecimal)).to.be.eq(true);

    // Sanity check
    expect(isSimilar(await weth.balanceOf(erc4626Vault.address), 0, shareDecimal)).to.be.eq(true);
  });
});