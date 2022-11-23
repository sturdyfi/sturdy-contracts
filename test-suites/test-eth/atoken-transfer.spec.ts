import {
  APPROVAL_AMOUNT_LENDING_POOL,
  MAX_UINT_AMOUNT,
  ZERO_ADDRESS,
} from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { expect } from 'chai';
import { ethers } from 'ethers';
import { RateMode, ProtocolErrors } from '../../helpers/types';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';


makeSuite('AToken: Transfer', (testEnv: TestEnv) => {
  const {
    INVALID_FROM_BALANCE_AFTER_TRANSFER,
    INVALID_TO_BALANCE_AFTER_TRANSFER,
    VL_TRANSFER_NOT_ALLOWED,
  } = ProtocolErrors;

  it('User 0 deposits 2 WETH, transfers to user 1', async () => {
    const { users, pool, weth, aWeth } = testEnv;

    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    const ethers = (DRE as any).ethers;

    await impersonateAccountsHardhat([wethOwnerAddress]);
    const signer = await ethers.provider.getSigner(wethOwnerAddress);

    //user 1 deposits 2 WETH
    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, '2');
    await weth.connect(signer).transfer(users[0].address, amountWETHtoDeposit);
    await weth.connect(users[0].signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    await pool
      .connect(users[0].signer)
      .deposit(weth.address, amountWETHtoDeposit, users[0].address, '0');

    await aWeth.connect(users[0].signer).transfer(users[1].address, amountWETHtoDeposit);

    const name = await aWeth.name();

    expect(name).to.be.equal('Sturdy_eth interest bearing WETH');

    const fromBalance = await aWeth.balanceOf(users[0].address);
    const toBalance = await aWeth.balanceOf(users[1].address);

    expect(fromBalance.toString()).to.be.equal('0', INVALID_FROM_BALANCE_AFTER_TRANSFER);
    expect(toBalance.toString()).to.be.equal(
      amountWETHtoDeposit.toString(),
      INVALID_TO_BALANCE_AFTER_TRANSFER
    );
  });

  it('User 1 tries to transfer a small amount of WETH back to user 0', async () => {
    const { users, pool, aWeth, weth } = testEnv;

    const aWETHtoTransfer = await convertToCurrencyDecimals(weth.address, '0.2');

    await aWeth.connect(users[1].signer).transfer(users[0].address, aWETHtoTransfer);

    const user0Balance = await aWeth.balanceOf(users[0].address);

    expect(user0Balance.toString()).to.be.eq(aWETHtoTransfer.toString());
  });
});
