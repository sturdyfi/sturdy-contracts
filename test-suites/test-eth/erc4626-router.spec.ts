import { makeSuite } from './helpers/make-suite';
import { mint } from './helpers/mint';
import { deployERC4626Router, deployERC4626Vault } from '../../helpers/contracts-deployments';
import { ERC4626Router, ERC4626Vault } from '../../types';
import { parseEther } from 'ethers/lib/utils';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';

const chai = require('chai');
const { expect } = chai;

makeSuite('ERC4626Router', (testEnv) => {
  let erc4626Router: ERC4626Router;
  let erc4626Vault: ERC4626Vault;

  before(async () => {
    // deploy WETH ERC4626 contract
    const { weth, aWeth, pool, users } = testEnv;
    const user = users[0];

    erc4626Vault = await deployERC4626Vault([
      weth.address,
      aWeth.address,
      pool.address
    ], 'WETH');

    // deploy ERC4626Router contract
    erc4626Router = await deployERC4626Router();

    //authorize vault
    await erc4626Router.authorizeVault(erc4626Vault.address);

    // Prepare WETH for user
    await mint('WETH', parseEther('4000').toString(), user);
  });

  it('mint', async () => {
    const { weth, aWeth, users } = testEnv;
    const user = users[0];

    // Approve router
    const assetAmount = parseEther('4000');
    await weth.connect(user.signer).approve(erc4626Router.address, assetAmount);

    // mint
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Router.connect(user.signer).mint(erc4626Vault.address, user.address, shareAmount, assetAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq(shareAmount);
    expect(await aWeth.balanceOf(erc4626Vault.address)).to.be.bignumber.eq(assetAmount);
    expect(await weth.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await weth.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('withdraw', async () => {
    const { weth, aWeth, users } = testEnv;
    const user = users[0];

    // Approve router
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Vault.connect(user.signer).approve(erc4626Router.address, shareAmount);

    // withdraw
    const assetAmount = parseEther('4000');
    await erc4626Router.connect(user.signer).withdraw(erc4626Vault.address, user.address, assetAmount, shareAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await aWeth.balanceOf(erc4626Vault.address)).to.be.bignumber.eq('0');
    expect(await weth.balanceOf(user.address)).to.be.bignumber.eq(assetAmount);
    expect(await weth.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('deposit', async () => {
    const { weth, aWeth, users } = testEnv;
    const user = users[0];

    // Approve router
    const assetAmount = parseEther('4000');
    await weth.connect(user.signer).approve(erc4626Router.address, assetAmount);

    // deposit
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Router.connect(user.signer).deposit(erc4626Vault.address, user.address, assetAmount, shareAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq(shareAmount);
    expect(await aWeth.balanceOf(erc4626Vault.address)).to.be.bignumber.eq(assetAmount);
    expect(await weth.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await weth.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });

  it('redeem', async () => {
    const { weth, aWeth, users } = testEnv;
    const user = users[0];

    // Approve router
    const shareAmount = await convertToCurrencyDecimals(erc4626Vault.address, '4000');
    await erc4626Vault.connect(user.signer).approve(erc4626Router.address, shareAmount);
    
    // redeem
    const assetAmount = parseEther('4000');
    await erc4626Router.connect(user.signer).redeem(erc4626Vault.address, user.address, shareAmount, assetAmount);

    expect(await erc4626Vault.balanceOf(user.address)).to.be.bignumber.eq('0');
    expect(await aWeth.balanceOf(erc4626Vault.address)).to.be.bignumber.eq('0');
    expect(await weth.balanceOf(user.address)).to.be.bignumber.eq(assetAmount);
    expect(await weth.balanceOf(erc4626Router.address)).to.be.bignumber.eq('0');
  });
});