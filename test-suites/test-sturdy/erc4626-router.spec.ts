import { makeSuite } from './helpers/make-suite';
import { mint } from './helpers/mint';
import { deployERC4626Router, deployERC4626Vault } from '../../helpers/contracts-deployments';
import { ERC4626Router, ERC4626Vault } from '../../types';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';

const chai = require('chai');
const { expect } = chai;

makeSuite('ERC4626Router-USDC', (testEnv) => {
  let erc4626Router: ERC4626Router;
  let erc4626Vault: ERC4626Vault;

  before(async () => {
    // deploy USDC ERC4626 contract
    const { usdc, aUsdc, pool, users } = testEnv;
    const user = users[0];

    erc4626Vault = await deployERC4626Vault([usdc.address, aUsdc.address, pool.address], 'USDC');

    // deploy ERC4626Router contract
    erc4626Router = await deployERC4626Router();

    //authorize vault
    await erc4626Router.authorizeVault(erc4626Vault.address);

    // Prepare USDC for user
    await mint('USDC', (await convertToCurrencyDecimals(usdc.address, '4000')).toString(), user);
  });

  it('mint', async () => {
    const { usdc, aUsdc, users } = testEnv;
    const user = users[0];

    // Approve router
    const assetAmount = await convertToCurrencyDecimals(usdc.address, '4000');
    await usdc.connect(user.signer).approve(erc4626Router.address, assetAmount);

    // mint
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .mint(erc4626Vault.address, user.address, shareAmount, assetAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq(shareAmount);
    expect(await aUsdc.balanceOf(erc4626Vault.address)).to.be.bignumber.eq(assetAmount);
    expect(await usdc.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await usdc.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('withdraw', async () => {
    const { usdc, aUsdc, users } = testEnv;
    const user = users[0];

    // Approve router
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Vault.connect(user.signer).approve(erc4626Router.address, shareAmount);

    // withdraw
    const assetAmount = await convertToCurrencyDecimals(usdc.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .withdraw(erc4626Vault.address, user.address, assetAmount, shareAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await aUsdc.balanceOf(erc4626Vault.address)).to.be.bignumber.eq('0');
    expect(await usdc.balanceOf(user.address)).to.be.bignumber.eq(assetAmount);
    expect(await usdc.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('deposit', async () => {
    const { usdc, aUsdc, users } = testEnv;
    const user = users[0];

    // Approve router
    const assetAmount = await convertToCurrencyDecimals(usdc.address, '4000');
    await usdc.connect(user.signer).approve(erc4626Router.address, assetAmount);

    // deposit
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .deposit(erc4626Vault.address, user.address, assetAmount, shareAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq(shareAmount);
    expect(await aUsdc.balanceOf(erc4626Vault.address)).to.be.bignumber.eq(assetAmount);
    expect(await usdc.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await usdc.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('redeem', async () => {
    const { usdc, aUsdc, users } = testEnv;
    const user = users[0];

    // Approve router
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Vault.connect(user.signer).approve(erc4626Router.address, shareAmount);

    // redeem
    const assetAmount = await convertToCurrencyDecimals(usdc.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .redeem(erc4626Vault.address, user.address, shareAmount, assetAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await aUsdc.balanceOf(erc4626Vault.address)).to.be.bignumber.eq('0');
    expect(await usdc.balanceOf(user.address)).to.be.bignumber.eq(assetAmount);
    expect(await usdc.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });
});

makeSuite('ERC4626Router-USDT', (testEnv) => {
  let erc4626Router: ERC4626Router;
  let erc4626Vault: ERC4626Vault;

  before(async () => {
    // deploy USDT ERC4626 contract
    const { usdt, aUsdt, pool, users } = testEnv;
    const user = users[0];

    erc4626Vault = await deployERC4626Vault([usdt.address, aUsdt.address, pool.address], 'USDT');

    // deploy ERC4626Router contract
    erc4626Router = await deployERC4626Router();

    //authorize vault
    await erc4626Router.authorizeVault(erc4626Vault.address);

    // Prepare USDT for user
    await mint('USDT', (await convertToCurrencyDecimals(usdt.address, '4000')).toString(), user);
  });

  it('mint', async () => {
    const { usdt, aUsdt, users } = testEnv;
    const user = users[0];

    // Approve router
    const assetAmount = await convertToCurrencyDecimals(usdt.address, '4000');
    await usdt.connect(user.signer).approve(erc4626Router.address, assetAmount);

    // mint
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .mint(erc4626Vault.address, user.address, shareAmount, assetAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq(shareAmount);
    expect(await aUsdt.balanceOf(erc4626Vault.address)).to.be.bignumber.eq(assetAmount);
    expect(await usdt.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await usdt.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('withdraw', async () => {
    const { usdt, aUsdt, users } = testEnv;
    const user = users[0];

    // Approve router
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Vault.connect(user.signer).approve(erc4626Router.address, shareAmount);

    // withdraw
    const assetAmount = await convertToCurrencyDecimals(usdt.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .withdraw(erc4626Vault.address, user.address, assetAmount, shareAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await aUsdt.balanceOf(erc4626Vault.address)).to.be.bignumber.eq('0');
    expect(await usdt.balanceOf(user.address)).to.be.bignumber.eq(assetAmount);
    expect(await usdt.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('deposit', async () => {
    const { usdt, aUsdt, users } = testEnv;
    const user = users[0];

    // Approve router
    const assetAmount = await convertToCurrencyDecimals(usdt.address, '4000');
    await usdt.connect(user.signer).approve(erc4626Router.address, assetAmount);

    // deposit
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .deposit(erc4626Vault.address, user.address, assetAmount, shareAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq(shareAmount);
    expect(await aUsdt.balanceOf(erc4626Vault.address)).to.be.bignumber.eq(assetAmount);
    expect(await usdt.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await usdt.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('redeem', async () => {
    const { usdt, aUsdt, users } = testEnv;
    const user = users[0];

    // Approve router
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Vault.connect(user.signer).approve(erc4626Router.address, shareAmount);

    // redeem
    const assetAmount = await convertToCurrencyDecimals(usdt.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .redeem(erc4626Vault.address, user.address, shareAmount, assetAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await aUsdt.balanceOf(erc4626Vault.address)).to.be.bignumber.eq('0');
    expect(await usdt.balanceOf(user.address)).to.be.bignumber.eq(assetAmount);
    expect(await usdt.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });
});

makeSuite('ERC4626Router-DAI', (testEnv) => {
  let erc4626Router: ERC4626Router;
  let erc4626Vault: ERC4626Vault;

  before(async () => {
    // deploy DAI ERC4626 contract
    const { dai, aDai, pool, users } = testEnv;
    const user = users[0];

    erc4626Vault = await deployERC4626Vault([dai.address, aDai.address, pool.address], 'DAI');

    // deploy ERC4626Router contract
    erc4626Router = await deployERC4626Router();

    //authorize vault
    await erc4626Router.authorizeVault(erc4626Vault.address);

    // Prepare DAI for user
    await mint('DAI', (await convertToCurrencyDecimals(dai.address, '4000')).toString(), user);
  });

  it('mint', async () => {
    const { dai, aDai, users } = testEnv;
    const user = users[0];

    // Approve router
    const assetAmount = await convertToCurrencyDecimals(dai.address, '4000');
    await dai.connect(user.signer).approve(erc4626Router.address, assetAmount);

    // mint
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .mint(erc4626Vault.address, user.address, shareAmount, assetAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq(shareAmount);
    expect(await aDai.balanceOf(erc4626Vault.address)).to.be.bignumber.eq(assetAmount);
    expect(await dai.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await dai.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('withdraw', async () => {
    const { dai, aDai, users } = testEnv;
    const user = users[0];

    // Approve router
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Vault.connect(user.signer).approve(erc4626Router.address, shareAmount);

    // withdraw
    const assetAmount = await convertToCurrencyDecimals(dai.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .withdraw(erc4626Vault.address, user.address, assetAmount, shareAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await aDai.balanceOf(erc4626Vault.address)).to.be.bignumber.eq('0');
    expect(await dai.balanceOf(user.address)).to.be.bignumber.eq(assetAmount);
    expect(await dai.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('deposit', async () => {
    const { dai, aDai, users } = testEnv;
    const user = users[0];

    // Approve router
    const assetAmount = await convertToCurrencyDecimals(dai.address, '4000');
    await dai.connect(user.signer).approve(erc4626Router.address, assetAmount);

    // deposit
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .deposit(erc4626Vault.address, user.address, assetAmount, shareAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq(shareAmount);
    expect(await aDai.balanceOf(erc4626Vault.address)).to.be.bignumber.eq(assetAmount);
    expect(await dai.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await dai.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('redeem', async () => {
    const { dai, aDai, users } = testEnv;
    const user = users[0];

    // Approve router
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Vault.connect(user.signer).approve(erc4626Router.address, shareAmount);

    // redeem
    const assetAmount = await convertToCurrencyDecimals(dai.address, '4000');
    await erc4626Router
      .connect(user.signer)
      .redeem(erc4626Vault.address, user.address, shareAmount, assetAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await aDai.balanceOf(erc4626Vault.address)).to.be.bignumber.eq('0');
    expect(await dai.balanceOf(user.address)).to.be.bignumber.eq(assetAmount);
    expect(await dai.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });
});
