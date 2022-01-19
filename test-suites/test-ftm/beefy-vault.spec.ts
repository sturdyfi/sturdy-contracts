/**
 * @dev test for beefyVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { printDivider } from './helpers/utils/helpers';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { APPROVAL_AMOUNT_LENDING_POOL, ZERO_ADDRESS } from '../../helpers/constants';

const { parseEther } = ethers.utils;

makeSuite('beefyVault', (testEnv: TestEnv) => {
  it('failed deposit for collateral without WETH', async () => {
    const { beefyVault } = testEnv;

    await expect(beefyVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.reverted;
  });

  it('deposit WETH for collateral', async () => {
    const { beefyVault, deployer, mooweth, aMOOWETH, WETH } = testEnv;

    const ethers = (DRE as any).ethers;

    // Make some test WETH for depositor
    const wethOwnerAddress = '0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe';
    await impersonateAccountsHardhat([wethOwnerAddress]);
    let signer = await ethers.provider.getSigner(wethOwnerAddress);
    const amountWETHtoDeposit = await convertToCurrencyDecimals(WETH.address, '1200');
    await WETH.connect(signer).Swapin(
      '0x95bd4c6cb7f10357bbed959c9110361d57bc13e75914b22b2c53537f8db72e3a',
      deployer.address,
      amountWETHtoDeposit
    );
    expect(await WETH.balanceOf(deployer.address)).to.be.equal(parseEther('1200'));

    await WETH.approve(beefyVault.address, parseEther('1200'));
    await beefyVault.depositCollateral(WETH.address, parseEther('1200'));
    expect(await mooweth.balanceOf(beefyVault.address)).to.be.equal(0);
    expect(await aMOOWETH.balanceOf(beefyVault.address)).to.be.equal(0);
    expect((await aMOOWETH.balanceOf(deployer.address)).gt(parseEther('1199.99999'))).to.be.equal(
      true
    );
    expect(await ethers.getDefaultProvider().getBalance(beefyVault.address)).to.be.equal(0);
  });
});
