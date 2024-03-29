import { makeSuite } from './helpers/make-suite';
import { mint } from './helpers/mint';
import { deployERC4626Vault } from '../../helpers/contracts-deployments';
import { ERC4626Vault, ISTRDY, ISTRDY__factory } from '../../types';
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { BigNumber } from 'ethers';
import { isSimilar } from './helpers/almost-equal';
import {
  DRE,
  advanceBlock,
  impersonateAccountsHardhat,
  timeLatest,
} from '../../helpers/misc-utils';

const chai = require('chai');
const { expect } = chai;

makeSuite('ERC4626-USDC - Configuration', (testEnv) => {
  let erc4626Vault: ERC4626Vault;

  before(async () => {
    // deploy USDC ERC4626 contract
    const { usdc, aUsdc, incentiveController, pool } = testEnv;

    erc4626Vault = await deployERC4626Vault(
      [usdc.address, aUsdc.address, pool.address, incentiveController.address],
      'USDC'
    );
  });

  it('check decimals, symbol, name, asset, aToken', async () => {
    const { usdc, aUsdc } = testEnv;

    expect(await erc4626Vault.decimals()).to.be.eq(6);
    expect(await erc4626Vault.symbol()).to.be.eq('ws2USDC');
    expect(await erc4626Vault.name()).to.be.eq('ERC4626-Wrapped Sturdy USDC');
    expect(await erc4626Vault.asset()).to.be.eq(usdc.address);
    expect(await erc4626Vault.aToken()).to.be.eq(aUsdc.address);
  });

  it('check maxDeposit, maxMint', async () => {
    const { usdc, configurator } = testEnv;

    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);

    // Freeze USDC
    await configurator.freezeReserve(usdc.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq('0');
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq('0');

    // UnFreeze USDC
    await configurator.unfreezeReserve(usdc.address);
    // Deactivate USDC
    await configurator.deactivateReserve(usdc.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq('0');
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq('0');

    // activate USDC
    await configurator.activateReserve(usdc.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
  });

  it('check maxWithdraw, maxRedeem', async () => {
    const { usdc, configurator, users } = testEnv;
    const user = users[0];

    // User Deposit 10 USDC
    const assetAmount = (await convertToCurrencyDecimals(usdc.address, '10')).toString();
    await mint('USDC', assetAmount, user);
    await usdc.connect(user.signer).approve(erc4626Vault.address, assetAmount);
    await erc4626Vault.connect(user.signer).deposit(assetAmount, user.address);

    expect(await erc4626Vault.maxWithdraw(user.address)).to.be.eq(assetAmount);
    expect(await erc4626Vault.maxRedeem(user.address)).to.be.eq(assetAmount);

    // Freeze USDC
    await configurator.freezeReserve(usdc.address);
    expect(await erc4626Vault.maxWithdraw(user.address)).to.be.eq(assetAmount);
    expect(await erc4626Vault.maxRedeem(user.address)).to.be.eq(assetAmount);

    // UnFreeze USDC
    await configurator.unfreezeReserve(usdc.address);
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

makeSuite('ERC4626-USDC - Scenario Test', (testEnv) => {
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
    // deploy USDC ERC4626 contract
    const { usdc, aUsdc, pool, incentiveController, users } = testEnv;
    const A = users[0];
    const B = users[1];

    erc4626Vault = await deployERC4626Vault(
      [usdc.address, aUsdc.address, pool.address, incentiveController.address],
      'USDC'
    );

    // Prepare Enough USDC for A(alice) and B(bob)
    await mint('USDC', (await convertToCurrencyDecimals(usdc.address, '4000')).toString(), A);
    await mint('USDC', (await convertToCurrencyDecimals(usdc.address, '7001')).toString(), B);

    // Approve vault
    await usdc
      .connect(A.signer)
      .approve(erc4626Vault.address, await convertToCurrencyDecimals(usdc.address, '4000'));
    await usdc
      .connect(B.signer)
      .approve(erc4626Vault.address, await convertToCurrencyDecimals(usdc.address, '7001'));
  });

  it('1. Alice mints 2000 shares (costs 2000 tokens)', async () => {
    const { users } = testEnv;
    const A = users[0];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2000');

    await erc4626Vault.connect(A.signer).mint(shareAmount, A.address);
    const ABalance = await erc4626Vault.balanceOf(A.address);
    AAssetAmount = await erc4626Vault.previewRedeem(shareAmount);
    AShareAmount = await erc4626Vault.previewDeposit(AAssetAmount);

    // Expect to have received the requested mint amount.
    expect(isSimilar(AShareAmount, shareAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, AShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToAssets(ABalance), AAssetAmount, shareDecimal)
    ).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToShares(AAssetAmount), ABalance, shareDecimal)
    ).to.be.eq(true);

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
    BAssetAmount = await erc4626Vault.previewMint(BShareAmount);

    // Expect to have received the requested underlying amount.
    expect(isSimilar(BAssetAmount, assetAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, BShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToAssets(BBalance), BAssetAmount, shareDecimal)
    ).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToShares(BAssetAmount), BBalance, shareDecimal)
    ).to.be.eq(true);

    // Expect a 1:1 ratio before mutation.
    expect(isSimilar(BShareAmount, BAssetAmount, shareDecimal)).to.be.eq(true);

    // Sanity check.
    const totalAmount = await convertToCurrencyDecimals(erc4626Vault.address, '6000');
    preMutationShareBal = AShareAmount.add(BShareAmount);
    preMutationBal = AAssetAmount.add(BAssetAmount);

    expect(isSimilar(await erc4626Vault.totalSupply(), preMutationShareBal, shareDecimal)).to.be.eq(
      true
    );
    expect(isSimilar(await erc4626Vault.totalAssets(), preMutationBal, shareDecimal)).to.be.eq(
      true
    );
    expect(isSimilar(await erc4626Vault.totalSupply(), totalAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), totalAmount, shareDecimal)).to.be.eq(true);
  });

  it('3. Vault mutates by +3000 tokens... ', async () => {
    const { pool, deployer, usdc, users, configurator } = testEnv;
    const A = users[0];
    const B = users[1];

    //    (simulated yield returned from strategy)...
    // The Vault now contains more tokens than deposited which causes the exchange rate to change.
    // A(alice) share is 33.33% of the Vault, B(bob) 66.66% of the Vault.
    // A's share count stays the same but the underlying amount changes from 2000 to 3000.
    // B's share count stays the same but the underlying amount changes from 4000 to 6000.
    mutationAssetAmount = await convertToCurrencyDecimals(usdc.address, '3000');
    await mint('USDC', mutationAssetAmount.toString(), deployer);
    await usdc.approve(pool.address, mutationAssetAmount);
    await configurator.registerVault(deployer.address);
    await pool.depositYield(usdc.address, mutationAssetAmount);

    expect(isSimilar(await erc4626Vault.totalSupply(), preMutationShareBal, shareDecimal)).to.be.eq(
      true
    );
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        preMutationBal.add(mutationAssetAmount),
        shareDecimal
      )
    ).to.be.eq(true);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(ABalance, AShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        AAssetAmount.add(mutationAssetAmount.div(3)),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(isSimilar(BBalance, BShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        BAssetAmount.add(mutationAssetAmount.div(3).mul(2)),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('4. Alice deposits 2000 tokens (mints 1333 shares)', async () => {
    const { users, usdc } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(usdc.address, '2000');

    await erc4626Vault.connect(A.signer).deposit(assetAmount, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '7333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '3333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(usdc.address, '4999'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '4000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdc.address, '6000'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('5. Bob mints 2000 shares (costs 3001 assets)', async () => {
    const { users, usdc } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2000');

    // NOTE: B's assets spent got rounded up
    // NOTE: A's vault assets got rounded up
    await erc4626Vault.connect(B.signer).mint(shareAmount, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '9333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '3333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(usdc.address, '5000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '6000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdc.address, '9000'),
        shareDecimal
      )
    ).to.be.eq(true);

    // Sanity checks:
    // A and B should have spent all their tokens now
    expect(isSimilar(await usdc.balanceOf(A.address), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await usdc.balanceOf(B.address), 0, shareDecimal)).to.be.eq(true);
    // Assets in vault: 4k (alice) + 7k (bob) + 3k (yield) + 1 (round up)
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(usdc.address, '14001'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('6. Vault mutates by +3000 tokens', async () => {
    const { pool, deployer, usdc, users } = testEnv;
    const A = users[0];
    const B = users[1];

    // NOTE: Vault holds 17001 tokens, but sum of assetsOf() is 17000.
    await mint('USDC', mutationAssetAmount.toString(), deployer);
    await usdc.approve(pool.address, mutationAssetAmount);
    await pool.depositYield(usdc.address, mutationAssetAmount);

    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(usdc.address, '17001'),
        shareDecimal
      )
    ).to.be.eq(true);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(usdc.address, '6071'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdc.address, '10929'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('7. Alice redeem 1333 shares (2428 assets)', async () => {
    const { users, usdc } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '1333');

    await erc4626Vault.connect(A.signer).redeem(shareAmount, A.address, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await usdc.balanceOf(A.address),
        await convertToCurrencyDecimals(usdc.address, '2428'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '8000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(usdc.address, '14573'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '2000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(usdc.address, '3643'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '6000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdc.address, '10929'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('8. Bob withdraws 2929 assets (1608 shares)', async () => {
    const { users, usdc } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2929');

    await erc4626Vault.connect(B.signer).withdraw(assetAmount, B.address, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await usdc.balanceOf(B.address),
        await convertToCurrencyDecimals(usdc.address, '2929'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '6392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(usdc.address, '11644'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '2000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(usdc.address, '3643'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '4392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdc.address, '8000'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('9. Alice withdraws 3643 assets (2000 shares)', async () => {
    const { users, usdc } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(erc4626Vault.address, '3643');

    await erc4626Vault.connect(A.signer).withdraw(assetAmount, A.address, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await usdc.balanceOf(A.address),
        await convertToCurrencyDecimals(usdc.address, '6071'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '4392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(usdc.address, '8001'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(isSimilar(ABalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), 0, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '4392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdc.address, '8000'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('10. Bob redeem 4392 shares (8001 tokens)', async () => {
    const { users, usdc } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4391.8');

    await erc4626Vault.connect(B.signer).redeem(shareAmount, B.address, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await usdc.balanceOf(B.address),
        await convertToCurrencyDecimals(usdc.address, '10929'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalSupply(), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), 0, shareDecimal)).to.be.eq(true);

    // Sanity check
    expect(isSimilar(await usdc.balanceOf(erc4626Vault.address), 0, shareDecimal)).to.be.eq(true);
  });
});

makeSuite('ERC4626-USDT - Configuration', (testEnv) => {
  let erc4626Vault: ERC4626Vault;

  before(async () => {
    // deploy USDT ERC4626 contract
    const { usdt, aUsdt, pool, incentiveController } = testEnv;

    erc4626Vault = await deployERC4626Vault(
      [usdt.address, aUsdt.address, pool.address, incentiveController.address],
      'USDT'
    );
  });

  it('check decimals, symbol, name, asset, aToken', async () => {
    const { usdt, aUsdt } = testEnv;

    expect(await erc4626Vault.decimals()).to.be.eq(6);
    expect(await erc4626Vault.symbol()).to.be.eq('ws2USDT');
    expect(await erc4626Vault.name()).to.be.eq('ERC4626-Wrapped Sturdy USDT');
    expect(await erc4626Vault.asset()).to.be.eq(usdt.address);
    expect(await erc4626Vault.aToken()).to.be.eq(aUsdt.address);
  });

  it('check maxDeposit, maxMint', async () => {
    const { usdt, configurator } = testEnv;

    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);

    // Freeze USDT
    await configurator.freezeReserve(usdt.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq('0');
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq('0');

    // UnFreeze USDT
    await configurator.unfreezeReserve(usdt.address);
    // Deactivate USDT
    await configurator.deactivateReserve(usdt.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq('0');
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq('0');

    // activate USDT
    await configurator.activateReserve(usdt.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
  });

  it('check maxWithdraw, maxRedeem', async () => {
    const { usdt, configurator, users } = testEnv;
    const user = users[0];

    // User Deposit 10 USDT
    const assetAmount = (await convertToCurrencyDecimals(usdt.address, '10')).toString();
    await mint('USDT', assetAmount, user);
    await usdt.connect(user.signer).approve(erc4626Vault.address, assetAmount);
    await erc4626Vault.connect(user.signer).deposit(assetAmount, user.address);

    expect(await erc4626Vault.maxWithdraw(user.address)).to.be.eq(assetAmount);
    expect(await erc4626Vault.maxRedeem(user.address)).to.be.eq(assetAmount);

    // Freeze USDT
    await configurator.freezeReserve(usdt.address);
    expect(await erc4626Vault.maxWithdraw(user.address)).to.be.eq(assetAmount);
    expect(await erc4626Vault.maxRedeem(user.address)).to.be.eq(assetAmount);

    // UnFreeze USDT
    await configurator.unfreezeReserve(usdt.address);
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

makeSuite('ERC4626-USDT - Scenario Test', (testEnv) => {
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
    // deploy USDT ERC4626 contract
    const { usdt, aUsdt, pool, incentiveController, users } = testEnv;
    const A = users[0];
    const B = users[1];

    erc4626Vault = await deployERC4626Vault(
      [usdt.address, aUsdt.address, pool.address, incentiveController.address],
      'USDT'
    );

    // Prepare Enough USDT for A(alice) and B(bob)
    await mint('USDT', (await convertToCurrencyDecimals(usdt.address, '4000')).toString(), A);
    await mint('USDT', (await convertToCurrencyDecimals(usdt.address, '7001')).toString(), B);

    // Approve vault
    await usdt
      .connect(A.signer)
      .approve(erc4626Vault.address, await convertToCurrencyDecimals(usdt.address, '4000'));
    await usdt
      .connect(B.signer)
      .approve(erc4626Vault.address, await convertToCurrencyDecimals(usdt.address, '7001'));
  });

  it('1. Alice mints 2000 shares (costs 2000 tokens)', async () => {
    const { users } = testEnv;
    const A = users[0];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2000');

    await erc4626Vault.connect(A.signer).mint(shareAmount, A.address);
    const ABalance = await erc4626Vault.balanceOf(A.address);
    AAssetAmount = await erc4626Vault.previewRedeem(shareAmount);
    AShareAmount = await erc4626Vault.previewDeposit(AAssetAmount);

    // Expect to have received the requested mint amount.
    expect(isSimilar(AShareAmount, shareAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, AShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToAssets(ABalance), AAssetAmount, shareDecimal)
    ).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToShares(AAssetAmount), ABalance, shareDecimal)
    ).to.be.eq(true);

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
    BAssetAmount = await erc4626Vault.previewMint(BShareAmount);

    // Expect to have received the requested underlying amount.
    expect(isSimilar(BAssetAmount, assetAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, BShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToAssets(BBalance), BAssetAmount, shareDecimal)
    ).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToShares(BAssetAmount), BBalance, shareDecimal)
    ).to.be.eq(true);

    // Expect a 1:1 ratio before mutation.
    expect(isSimilar(BShareAmount, BAssetAmount, shareDecimal)).to.be.eq(true);

    // Sanity check.
    const totalAmount = await convertToCurrencyDecimals(erc4626Vault.address, '6000');
    preMutationShareBal = AShareAmount.add(BShareAmount);
    preMutationBal = AAssetAmount.add(BAssetAmount);

    expect(isSimilar(await erc4626Vault.totalSupply(), preMutationShareBal, shareDecimal)).to.be.eq(
      true
    );
    expect(isSimilar(await erc4626Vault.totalAssets(), preMutationBal, shareDecimal)).to.be.eq(
      true
    );
    expect(isSimilar(await erc4626Vault.totalSupply(), totalAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), totalAmount, shareDecimal)).to.be.eq(true);
  });

  it('3. Vault mutates by +3000 tokens... ', async () => {
    const { pool, deployer, usdt, users, configurator } = testEnv;
    const A = users[0];
    const B = users[1];

    //    (simulated yield returned from strategy)...
    // The Vault now contains more tokens than deposited which causes the exchange rate to change.
    // A(alice) share is 33.33% of the Vault, B(bob) 66.66% of the Vault.
    // A's share count stays the same but the underlying amount changes from 2000 to 3000.
    // B's share count stays the same but the underlying amount changes from 4000 to 6000.
    mutationAssetAmount = await convertToCurrencyDecimals(usdt.address, '3000');
    await mint('USDT', mutationAssetAmount.toString(), deployer);
    await usdt.approve(pool.address, mutationAssetAmount);
    await configurator.registerVault(deployer.address);
    await pool.depositYield(usdt.address, mutationAssetAmount);

    expect(isSimilar(await erc4626Vault.totalSupply(), preMutationShareBal, shareDecimal)).to.be.eq(
      true
    );
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        preMutationBal.add(mutationAssetAmount),
        shareDecimal
      )
    ).to.be.eq(true);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(ABalance, AShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        AAssetAmount.add(mutationAssetAmount.div(3)),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(isSimilar(BBalance, BShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        BAssetAmount.add(mutationAssetAmount.div(3).mul(2)),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('4. Alice deposits 2000 tokens (mints 1333 shares)', async () => {
    const { users, usdt } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(usdt.address, '2000');

    await erc4626Vault.connect(A.signer).deposit(assetAmount, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '7333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '3333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(usdt.address, '4999'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '4000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdt.address, '6000'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('5. Bob mints 2000 shares (costs 3001 assets)', async () => {
    const { users, usdt } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2000');

    // NOTE: B's assets spent got rounded up
    // NOTE: A's vault assets got rounded up
    await erc4626Vault.connect(B.signer).mint(shareAmount, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '9333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '3333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(usdt.address, '5000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '6000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdt.address, '9000'),
        shareDecimal
      )
    ).to.be.eq(true);

    // Sanity checks:
    // A and B should have spent all their tokens now
    expect(isSimilar(await usdt.balanceOf(A.address), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await usdt.balanceOf(B.address), 0, shareDecimal)).to.be.eq(true);
    // Assets in vault: 4k (alice) + 7k (bob) + 3k (yield) + 1 (round up)
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(usdt.address, '14001'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('6. Vault mutates by +3000 tokens', async () => {
    const { pool, deployer, usdt, users } = testEnv;
    const A = users[0];
    const B = users[1];

    // NOTE: Vault holds 17001 tokens, but sum of assetsOf() is 17000.
    await mint('USDT', mutationAssetAmount.toString(), deployer);
    await usdt.approve(pool.address, mutationAssetAmount);
    await pool.depositYield(usdt.address, mutationAssetAmount);

    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(usdt.address, '17001'),
        shareDecimal
      )
    ).to.be.eq(true);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(usdt.address, '6071'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdt.address, '10929'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('7. Alice redeem 1333 shares (2428 assets)', async () => {
    const { users, usdt } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '1333');

    await erc4626Vault.connect(A.signer).redeem(shareAmount, A.address, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await usdt.balanceOf(A.address),
        await convertToCurrencyDecimals(usdt.address, '2428'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '8000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(usdt.address, '14573'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '2000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(usdt.address, '3643'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '6000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdt.address, '10929'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('8. Bob withdraws 2929 assets (1608 shares)', async () => {
    const { users, usdt } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2929');

    await erc4626Vault.connect(B.signer).withdraw(assetAmount, B.address, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await usdt.balanceOf(B.address),
        await convertToCurrencyDecimals(usdt.address, '2929'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '6392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(usdt.address, '11644'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '2000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(usdt.address, '3643'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '4392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdt.address, '8000'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('9. Alice withdraws 3643 assets (2000 shares)', async () => {
    const { users, usdt } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(erc4626Vault.address, '3643');

    await erc4626Vault.connect(A.signer).withdraw(assetAmount, A.address, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await usdt.balanceOf(A.address),
        await convertToCurrencyDecimals(usdt.address, '6071'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '4392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(usdt.address, '8001'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(isSimilar(ABalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), 0, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '4392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(usdt.address, '8000'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('10. Bob redeem 4392 shares (8001 tokens)', async () => {
    const { users, usdt } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4391.8');

    await erc4626Vault.connect(B.signer).redeem(shareAmount, B.address, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await usdt.balanceOf(B.address),
        await convertToCurrencyDecimals(usdt.address, '10929'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalSupply(), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), 0, shareDecimal)).to.be.eq(true);

    // Sanity check
    expect(isSimilar(await usdt.balanceOf(erc4626Vault.address), 0, shareDecimal)).to.be.eq(true);
  });
});

makeSuite('ERC4626-DAI - Configuration', (testEnv) => {
  let erc4626Vault: ERC4626Vault;

  before(async () => {
    // deploy DAI ERC4626 contract
    const { dai, aDai, pool, incentiveController } = testEnv;

    erc4626Vault = await deployERC4626Vault(
      [dai.address, aDai.address, pool.address, incentiveController.address],
      'DAI'
    );
  });

  it('check decimals, symbol, name, asset, aToken', async () => {
    const { dai, aDai } = testEnv;

    expect(await erc4626Vault.decimals()).to.be.eq(18);
    expect(await erc4626Vault.symbol()).to.be.eq('ws2DAI');
    expect(await erc4626Vault.name()).to.be.eq('ERC4626-Wrapped Sturdy DAI');
    expect(await erc4626Vault.asset()).to.be.eq(dai.address);
    expect(await erc4626Vault.aToken()).to.be.eq(aDai.address);
  });

  it('check maxDeposit, maxMint', async () => {
    const { dai, configurator } = testEnv;

    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);

    // Freeze DAI
    await configurator.freezeReserve(dai.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq('0');
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq('0');

    // UnFreeze DAI
    await configurator.unfreezeReserve(dai.address);
    // Deactivate DAI
    await configurator.deactivateReserve(dai.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq('0');
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq('0');

    // activate DAI
    await configurator.activateReserve(dai.address);
    expect(await erc4626Vault.maxDeposit(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
    expect(await erc4626Vault.maxMint(ZERO_ADDRESS)).to.be.eq(MAX_UINT_AMOUNT);
  });

  it('check maxWithdraw, maxRedeem', async () => {
    const { dai, configurator, users } = testEnv;
    const user = users[0];

    // User Deposit 10 DAI
    const assetAmount = (await convertToCurrencyDecimals(dai.address, '10')).toString();
    await mint('DAI', assetAmount, user);
    await dai.connect(user.signer).approve(erc4626Vault.address, assetAmount);
    await erc4626Vault.connect(user.signer).deposit(assetAmount, user.address);

    expect(await erc4626Vault.maxWithdraw(user.address)).to.be.eq(assetAmount);
    expect(await erc4626Vault.maxRedeem(user.address)).to.be.eq(assetAmount);

    // Freeze DAI
    await configurator.freezeReserve(dai.address);
    expect(await erc4626Vault.maxWithdraw(user.address)).to.be.eq(assetAmount);
    expect(await erc4626Vault.maxRedeem(user.address)).to.be.eq(assetAmount);

    // UnFreeze DAI
    await configurator.unfreezeReserve(dai.address);
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

makeSuite('ERC4626-DAI - Scenario Test', (testEnv) => {
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
    // deploy DAI ERC4626 contract
    const { dai, aDai, pool, incentiveController, users } = testEnv;
    const A = users[0];
    const B = users[1];

    erc4626Vault = await deployERC4626Vault(
      [dai.address, aDai.address, pool.address, incentiveController.address],
      'DAI'
    );

    // Prepare Enough DAI for A(alice) and B(bob)
    await mint('DAI', (await convertToCurrencyDecimals(dai.address, '4000')).toString(), A);
    await mint('DAI', (await convertToCurrencyDecimals(dai.address, '7001')).toString(), B);

    // Approve vault
    await dai
      .connect(A.signer)
      .approve(erc4626Vault.address, await convertToCurrencyDecimals(dai.address, '4000'));
    await dai
      .connect(B.signer)
      .approve(erc4626Vault.address, await convertToCurrencyDecimals(dai.address, '7001'));
  });

  it('1. Alice mints 2000 shares (costs 2000 tokens)', async () => {
    const { users } = testEnv;
    const A = users[0];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2000');

    await erc4626Vault.connect(A.signer).mint(shareAmount, A.address);
    const ABalance = await erc4626Vault.balanceOf(A.address);
    AAssetAmount = await erc4626Vault.previewRedeem(shareAmount);
    AShareAmount = await erc4626Vault.previewDeposit(AAssetAmount);

    // Expect to have received the requested mint amount.
    expect(isSimilar(AShareAmount, shareAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, AShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToAssets(ABalance), AAssetAmount, shareDecimal)
    ).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToShares(AAssetAmount), ABalance, shareDecimal)
    ).to.be.eq(true);

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
    BAssetAmount = await erc4626Vault.previewMint(BShareAmount);

    // Expect to have received the requested underlying amount.
    expect(isSimilar(BAssetAmount, assetAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, BShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToAssets(BBalance), BAssetAmount, shareDecimal)
    ).to.be.eq(true);
    expect(
      isSimilar(await erc4626Vault.convertToShares(BAssetAmount), BBalance, shareDecimal)
    ).to.be.eq(true);

    // Expect a 1:1 ratio before mutation.
    expect(isSimilar(BShareAmount, BAssetAmount, shareDecimal)).to.be.eq(true);

    // Sanity check.
    const totalAmount = await convertToCurrencyDecimals(erc4626Vault.address, '6000');
    preMutationShareBal = AShareAmount.add(BShareAmount);
    preMutationBal = AAssetAmount.add(BAssetAmount);

    expect(isSimilar(await erc4626Vault.totalSupply(), preMutationShareBal, shareDecimal)).to.be.eq(
      true
    );
    expect(isSimilar(await erc4626Vault.totalAssets(), preMutationBal, shareDecimal)).to.be.eq(
      true
    );
    expect(isSimilar(await erc4626Vault.totalSupply(), totalAmount, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), totalAmount, shareDecimal)).to.be.eq(true);
  });

  it('3. Vault mutates by +3000 tokens... ', async () => {
    const { pool, deployer, dai, users, configurator } = testEnv;
    const A = users[0];
    const B = users[1];

    //    (simulated yield returned from strategy)...
    // The Vault now contains more tokens than deposited which causes the exchange rate to change.
    // A(alice) share is 33.33% of the Vault, B(bob) 66.66% of the Vault.
    // A's share count stays the same but the underlying amount changes from 2000 to 3000.
    // B's share count stays the same but the underlying amount changes from 4000 to 6000.
    mutationAssetAmount = await convertToCurrencyDecimals(dai.address, '3000');
    await mint('DAI', mutationAssetAmount.toString(), deployer);
    await dai.approve(pool.address, mutationAssetAmount);
    await configurator.registerVault(deployer.address);
    await pool.depositYield(dai.address, mutationAssetAmount);

    expect(isSimilar(await erc4626Vault.totalSupply(), preMutationShareBal, shareDecimal)).to.be.eq(
      true
    );
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        preMutationBal.add(mutationAssetAmount),
        shareDecimal
      )
    ).to.be.eq(true);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(isSimilar(ABalance, AShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        AAssetAmount.add(mutationAssetAmount.div(3)),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(isSimilar(BBalance, BShareAmount, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        BAssetAmount.add(mutationAssetAmount.div(3).mul(2)),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('4. Alice deposits 2000 tokens (mints 1333 shares)', async () => {
    const { users, dai } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(dai.address, '2000');

    await erc4626Vault.connect(A.signer).deposit(assetAmount, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '7333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '3333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(dai.address, '4999'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '4000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(dai.address, '6000'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('5. Bob mints 2000 shares (costs 3001 assets)', async () => {
    const { users, dai } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2000');

    // NOTE: B's assets spent got rounded up
    // NOTE: A's vault assets got rounded up
    await erc4626Vault.connect(B.signer).mint(shareAmount, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '9333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '3333'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(dai.address, '5000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '6000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(dai.address, '9000'),
        shareDecimal
      )
    ).to.be.eq(true);

    // Sanity checks:
    // A and B should have spent all their tokens now
    expect(isSimilar(await dai.balanceOf(A.address), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await dai.balanceOf(B.address), 0, shareDecimal)).to.be.eq(true);
    // Assets in vault: 4k (alice) + 7k (bob) + 3k (yield) + 1 (round up)
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(dai.address, '14001'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('6. Vault mutates by +3000 tokens', async () => {
    const { pool, deployer, dai, users } = testEnv;
    const A = users[0];
    const B = users[1];

    // NOTE: Vault holds 17001 tokens, but sum of assetsOf() is 17000.
    await mint('DAI', mutationAssetAmount.toString(), deployer);
    await dai.approve(pool.address, mutationAssetAmount);
    await pool.depositYield(dai.address, mutationAssetAmount);

    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(dai.address, '17001'),
        shareDecimal
      )
    ).to.be.eq(true);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(dai.address, '6071'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(dai.address, '10929'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('7. Alice redeem 1333 shares (2428 assets)', async () => {
    const { users, dai } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '1333');

    await erc4626Vault.connect(A.signer).redeem(shareAmount, A.address, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await dai.balanceOf(A.address),
        await convertToCurrencyDecimals(dai.address, '2428'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '8000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(dai.address, '14573'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '2000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(dai.address, '3643'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '6000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(dai.address, '10929'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('8. Bob withdraws 2929 assets (1608 shares)', async () => {
    const { users, dai } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(erc4626Vault.address, '2929');

    await erc4626Vault.connect(B.signer).withdraw(assetAmount, B.address, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await dai.balanceOf(B.address),
        await convertToCurrencyDecimals(dai.address, '2929'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '6392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(dai.address, '11644'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        ABalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '2000'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(ABalance),
        await convertToCurrencyDecimals(dai.address, '3643'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '4392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(dai.address, '8000'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('9. Alice withdraws 3643 assets (2000 shares)', async () => {
    const { users, dai } = testEnv;
    const A = users[0];
    const B = users[1];
    const assetAmount = await convertToCurrencyDecimals(erc4626Vault.address, '3643');

    await erc4626Vault.connect(A.signer).withdraw(assetAmount, A.address, A.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await dai.balanceOf(A.address),
        await convertToCurrencyDecimals(dai.address, '6071'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalSupply(),
        await convertToCurrencyDecimals(erc4626Vault.address, '4392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.totalAssets(),
        await convertToCurrencyDecimals(dai.address, '8001'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(isSimilar(ABalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), 0, shareDecimal)).to.be.eq(true);
    expect(
      isSimilar(
        BBalance,
        await convertToCurrencyDecimals(erc4626Vault.address, '4392'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(
      isSimilar(
        await erc4626Vault.convertToAssets(BBalance),
        await convertToCurrencyDecimals(dai.address, '8000'),
        shareDecimal
      )
    ).to.be.eq(true);
  });

  it('10. Bob redeem 4392 shares (8001 tokens)', async () => {
    const { users, dai } = testEnv;
    const A = users[0];
    const B = users[1];
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4391.8');

    await erc4626Vault.connect(B.signer).redeem(shareAmount, B.address, B.address);

    const ABalance = await erc4626Vault.balanceOf(A.address);
    const BBalance = await erc4626Vault.balanceOf(B.address);
    expect(
      isSimilar(
        await dai.balanceOf(B.address),
        await convertToCurrencyDecimals(dai.address, '10929'),
        shareDecimal
      )
    ).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalSupply(), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.totalAssets(), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(ABalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(ABalance), 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(BBalance, 0, shareDecimal)).to.be.eq(true);
    expect(isSimilar(await erc4626Vault.convertToAssets(BBalance), 0, shareDecimal)).to.be.eq(true);

    // Sanity check
    expect(isSimilar(await dai.balanceOf(erc4626Vault.address), 0, shareDecimal)).to.be.eq(true);
  });
});

const DISTRIBUTION_DURATION = 86400; //1day
makeSuite('Check STRDY token growing ', (testEnv) => {
  let erc4626Vault: ERC4626Vault;
  let STRDY: ISTRDY;

  before(async () => {
    // deploy USDC ERC4626 contract
    const { usdc, aUsdc, pool, incentiveController, deployer } = testEnv;

    erc4626Vault = await deployERC4626Vault(
      [usdc.address, aUsdc.address, pool.address, incentiveController.address],
      'USDC'
    );
    STRDY = ISTRDY__factory.connect('0x59276455177429ae2af1cc62B77AE31B34EC3890', deployer.signer);
  });

  it('User deposits USDC via ERC4626 vault', async () => {
    const { incentiveController, users, usdc, aUsdc } = testEnv;
    const ethers = (DRE as any).ethers;
    const A = users[0];
    const B = users[1];

    // Prepare Enough USDC for A(alice) and B(bob)
    await mint('USDC', (await convertToCurrencyDecimals(usdc.address, '4000')).toString(), A);
    await mint('USDC', (await convertToCurrencyDecimals(usdc.address, '7000')).toString(), B);

    // Approve vault
    await usdc
      .connect(A.signer)
      .approve(erc4626Vault.address, await convertToCurrencyDecimals(usdc.address, '4000'));

    await usdc
      .connect(B.signer)
      .approve(erc4626Vault.address, await convertToCurrencyDecimals(usdc.address, '7000'));

    // configure incentive controller
    const deployerAddress = '0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc';
    await impersonateAccountsHardhat([deployerAddress]);
    let signer = await ethers.provider.getSigner(deployerAddress);
    await STRDY.connect(signer).transfer(
      incentiveController.address,
      await convertToCurrencyDecimals(STRDY.address, '10000')
    );
    await STRDY.connect(signer).setRoleCapability(0, '0xa9059cbb', true);
    await STRDY.connect(signer).setUserRole(incentiveController.address, 0, true);
    await STRDY.connect(signer).setUserRole(erc4626Vault.address, 0, true);
    await incentiveController.configureAssets([aUsdc.address], [10]);
    await incentiveController.setDistributionEnd(
      (await timeLatest()).plus(DISTRIBUTION_DURATION).toString()
    );
    await advanceBlock((await timeLatest()).plus(100).toNumber());

    let unclaimedDepositorRewardsBeforeA = await erc4626Vault.getRewardsBalance(A.address);
    expect(unclaimedDepositorRewardsBeforeA.toString()).to.be.bignumber.equal('0');
    let unclaimedDepositorRewardsBeforeB = await erc4626Vault.getRewardsBalance(B.address);
    expect(unclaimedDepositorRewardsBeforeB.toString()).to.be.bignumber.equal('0');

    //A deposits 4000 USDC, B deposit 7000 USCD
    await erc4626Vault
      .connect(A.signer)
      .deposit(await convertToCurrencyDecimals(usdc.address, '4000'), A.address);
    await erc4626Vault
      .connect(B.signer)
      .deposit(await convertToCurrencyDecimals(usdc.address, '7000'), B.address);
    await advanceBlock((await timeLatest()).plus(100).toNumber());

    unclaimedDepositorRewardsBeforeA = await erc4626Vault.getRewardsBalance(A.address);
    unclaimedDepositorRewardsBeforeB = await erc4626Vault.getRewardsBalance(B.address);
    let claimedAmountA = await STRDY.balanceOf(A.address);
    let claimedAmountB = await STRDY.balanceOf(B.address);
    expect(unclaimedDepositorRewardsBeforeA.toString()).to.be.bignumber.lte('400');
    expect(unclaimedDepositorRewardsBeforeA.toString()).to.be.bignumber.gte('350');
    expect(unclaimedDepositorRewardsBeforeB.toString()).to.be.bignumber.lte('700');
    expect(unclaimedDepositorRewardsBeforeB.toString()).to.be.bignumber.gte('600');
    expect(claimedAmountA.toString()).to.be.bignumber.equal('0');
    expect(claimedAmountB.toString()).to.be.bignumber.equal('0');

    //claim rewards of depositor
    await erc4626Vault.connect(A.signer).claimRewards(100, A.address);
    await erc4626Vault.connect(B.signer).claimRewards(200, B.address);

    let unclaimedDepositorRewardsAfterA = await erc4626Vault.getRewardsBalance(A.address);
    let unclaimedDepositorRewardsAfterB = await erc4626Vault.getRewardsBalance(B.address);
    claimedAmountA = await STRDY.balanceOf(A.address);
    claimedAmountB = await STRDY.balanceOf(B.address);
    expect(unclaimedDepositorRewardsAfterA.toString()).to.be.bignumber.lte('300');
    expect(unclaimedDepositorRewardsAfterA.toString()).to.be.bignumber.gte('250');
    expect(unclaimedDepositorRewardsAfterB.toString()).to.be.bignumber.lte('500');
    expect(unclaimedDepositorRewardsAfterB.toString()).to.be.bignumber.gte('400');
    expect(claimedAmountA.toString()).to.be.bignumber.equal('100');
    expect(claimedAmountB.toString()).to.be.bignumber.equal('200');
  });
});
