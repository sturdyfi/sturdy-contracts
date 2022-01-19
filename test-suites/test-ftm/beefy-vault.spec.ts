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
    // TODO
    const { beefyVault } = testEnv;

    await expect(beefyVault.depositCollateral(ZERO_ADDRESS, 0)).to.be.reverted;
  });
});
