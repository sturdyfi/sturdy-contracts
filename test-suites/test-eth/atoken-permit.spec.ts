import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../../helpers/constants';
import {
  buildPermitParams,
  convertToCurrencyDecimals,
  getSignatureFromTypedData,
} from '../../helpers/contracts-helpers';
import { expect } from 'chai';
import { ethers } from 'ethers';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { waitForTx } from '../../helpers/misc-utils';
import { _TypedDataEncoder } from 'ethers/lib/utils';

const { parseEther } = ethers.utils;

makeSuite('AToken: Permit', (testEnv: TestEnv) => {
  it('Checks the domain separator', async () => {
    const { aWeth } = testEnv;
    const separator = await aWeth.DOMAIN_SEPARATOR();

    const domain = {
      name: await aWeth.name(),
      version: '1',
      chainId: DRE.network.config.chainId,
      verifyingContract: aWeth.address,
    };
    const domainSeparator = _TypedDataEncoder.hashDomain(domain);

    expect(separator).to.be.equal(domainSeparator, 'Invalid domain separator');
  });

  it('Get aWETH for tests', async () => {
    const { weth, pool, users } = testEnv;
    const user = users[0];
    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    const ethers = (DRE as any).ethers;

    await impersonateAccountsHardhat([wethOwnerAddress]);
    const signer = await ethers.provider.getSigner(wethOwnerAddress);
    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, '7');
    await weth.connect(signer).transfer(user.address, amountWETHtoDeposit);
    await weth.connect(user.signer).approve(pool.address, amountWETHtoDeposit);

    await pool.connect(user.signer).deposit(weth.address, amountWETHtoDeposit, user.address, 0);
  });

  it('Reverts submitting a permit with 0 expiration', async () => {
    const { aWeth, users } = testEnv;
    const owner = users[0];
    const spender = users[2];

    const tokenName = await aWeth.name();

    const chainId = DRE.network.config.chainId;
    const expiration = 0;
    const nonce = (await aWeth._nonces(owner.address)).toNumber();
    const permitAmount = ethers.utils.parseEther('2').toString();
    const msgParams = buildPermitParams(
      chainId,
      aWeth.address,
      '1',
      tokenName,
      owner.address,
      spender.address,
      nonce,
      permitAmount,
      expiration.toFixed()
    );

    const ownerPrivateKey = require('../../test-wallets.js').accounts[1].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    expect((await aWeth.allowance(owner.address, spender.address)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_BEFORE_PERMIT'
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      aWeth
        .connect(spender.signer)
        .permit(owner.address, spender.address, permitAmount, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_EXPIRATION');

    expect((await aWeth.allowance(owner.address, spender.address)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_AFTER_PERMIT'
    );
  });

  it('Submits a permit with maximum expiration length', async () => {
    const { aWeth, users } = testEnv;
    const owner = users[0];
    const spender = users[2];

    const chainId = DRE.network.config.chainId;
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await aWeth._nonces(owner.address)).toNumber();
    const permitAmount = parseEther('2').toString();
    const msgParams = buildPermitParams(
      chainId,
      aWeth.address,
      '1',
      await aWeth.name(),
      owner.address,
      spender.address,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = require('../../test-wallets.js').accounts[1].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    expect((await aWeth.allowance(owner.address, spender.address)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_BEFORE_PERMIT'
    );

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await waitForTx(
      await aWeth
        .connect(spender.signer)
        .permit(owner.address, spender.address, permitAmount, deadline, v, r, s)
    );

    expect((await aWeth._nonces(owner.address)).toNumber()).to.be.equal(1);
  });

  it('Cancels the previous permit', async () => {
    const { aWeth, users } = testEnv;
    const owner = users[0];
    const spender = users[2];

    const chainId = DRE.network.config.chainId;
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await aWeth._nonces(owner.address)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      aWeth.address,
      '1',
      await aWeth.name(),
      owner.address,
      spender.address,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = require('../../test-wallets.js').accounts[1].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    expect((await aWeth.allowance(owner.address, spender.address)).toString()).to.be.equal(
      ethers.utils.parseEther('2'),
      'INVALID_ALLOWANCE_BEFORE_PERMIT'
    );

    await waitForTx(
      await aWeth
        .connect(spender.signer)
        .permit(owner.address, spender.address, permitAmount, deadline, v, r, s)
    );
    expect((await aWeth.allowance(owner.address, spender.address)).toString()).to.be.equal(
      permitAmount,
      'INVALID_ALLOWANCE_AFTER_PERMIT'
    );

    expect((await aWeth._nonces(owner.address)).toNumber()).to.be.equal(2);
  });

  it('Tries to submit a permit with invalid nonce', async () => {
    const { aWeth, users } = testEnv;
    const owner = users[0];
    const spender = users[2];

    const chainId = DRE.network.config.chainId;
    const deadline = MAX_UINT_AMOUNT;
    const nonce = 1000;
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      aWeth.address,
      '1',
      await aWeth.name(),
      owner.address,
      spender.address,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = require('../../test-wallets.js').accounts[1].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      aWeth
        .connect(spender.signer)
        .permit(owner.address, spender.address, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('Tries to submit a permit with invalid expiration (previous to the current block)', async () => {
    const { aWeth, users } = testEnv;
    const owner = users[0];
    const spender = users[2];

    const chainId = DRE.network.config.chainId;
    const expiration = '1';
    const nonce = (await aWeth._nonces(owner.address)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      aWeth.address,
      '1',
      await aWeth.name(),
      owner.address,
      spender.address,
      nonce,
      expiration,
      permitAmount
    );

    const ownerPrivateKey = require('../../test-wallets.js').accounts[1].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      aWeth
        .connect(spender.signer)
        .permit(owner.address, spender.address, expiration, permitAmount, v, r, s)
    ).to.be.revertedWith('INVALID_EXPIRATION');
  });

  it('Tries to submit a permit with invalid signature', async () => {
    const { aWeth, users } = testEnv;
    const owner = users[0];
    const spender = users[2];

    const chainId = DRE.network.config.chainId;
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await aWeth._nonces(owner.address)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      aWeth.address,
      '1',
      await aWeth.name(),
      owner.address,
      spender.address,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = require('../../test-wallets.js').accounts[1].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      aWeth
        .connect(spender.signer)
        .permit(owner.address, ZERO_ADDRESS, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('Tries to submit a permit with invalid owner', async () => {
    const { aWeth, users } = testEnv;
    const owner = users[0];
    const spender = users[2];

    const chainId = DRE.network.config.chainId;
    const expiration = MAX_UINT_AMOUNT;
    const nonce = (await aWeth._nonces(owner.address)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      aWeth.address,
      '1',
      await aWeth.name(),
      owner.address,
      spender.address,
      nonce,
      expiration,
      permitAmount
    );

    const ownerPrivateKey = require('../../test-wallets.js').accounts[1].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      aWeth
        .connect(spender.signer)
        .permit(ZERO_ADDRESS, spender.address, expiration, permitAmount, v, r, s)
    ).to.be.revertedWith('INVALID_OWNER');
  });
});
