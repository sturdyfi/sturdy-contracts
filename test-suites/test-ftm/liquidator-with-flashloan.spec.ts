/**
 * @dev test for yearnWETHVault functions
 */

import { expect } from 'chai';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { ethers } from 'ethers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';

const { parseEther } = ethers.utils;

// should pass on block number 31646405??
makeSuite('Liquidator', (testEnv: TestEnv) => {
  it('call liquidator', async () => {
    const { liquidator, deployer, usdc, WFTM } = testEnv;
    const abiEncoder = new ethers.utils.AbiCoder();
    const encodedData = abiEncoder.encode(
      ["address", "address"],
      [WFTM.address, deployer.address]
    );
    const beforeBalance = await usdc.balanceOf(liquidator.address);
    await liquidator.liquidation(usdc.address, await convertToCurrencyDecimals(usdc.address, '100'), encodedData);
    const currentBalance = await usdc.balanceOf(liquidator.address);
    console.log(beforeBalance.toString(), currentBalance.toString());
  });
});