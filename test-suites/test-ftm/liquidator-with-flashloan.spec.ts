// /**
//  * @dev test for liquidation with flashloan contract
//  */

// import { expect } from 'chai';
// import { makeSuite, TestEnv } from './helpers/make-suite';
// import { ethers } from 'ethers';
// import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';
// import { convertToCurrencyDecimals, getEthersSigners } from '../../helpers/contracts-helpers';
// import { getLendingPoolConfiguratorProxy } from '../../helpers/contracts-getters';

// const { parseEther } = ethers.utils;

// // should pass on block number 34239888 on forked ftm without deploy case
// makeSuite('Liquidator', (testEnv: TestEnv) => {
//   it('call liquidator', async () => {
//     const { liquidator, deployer, usdc, WFTM, yvwftm } = testEnv;
//     const ethers = (DRE as any).ethers;
//     const abiEncoder = new ethers.utils.AbiCoder();
//     const encodedData = abiEncoder.encode(
//       ["address", "address"],
//       [WFTM.address, deployer.address]
//     );
//     // set liquidation threshold 35%
//     await impersonateAccountsHardhat(['0x154D73802a6B3324c017481AC818050afE4a0b0A']);
//     let signer = await ethers.provider.getSigner('0x154D73802a6B3324c017481AC818050afE4a0b0A');
//     const configurator = await getLendingPoolConfiguratorProxy();
//     await configurator.connect(signer).configureReserveAsCollateral(yvwftm.address, '3000', '3500', '10500');

//     // process liquidation by using flashloan contract
//     await liquidator.liquidation(usdc.address, await convertToCurrencyDecimals(usdc.address, '100'), encodedData);
    
//     // withdraw remained usdc from flashloan contract
//     const beforeUsdcBalance = await usdc.balanceOf(deployer.address);
//     await liquidator.connect(deployer.signer).withdraw(usdc.address);
//     const usdcBalance = await usdc.balanceOf(deployer.address);
//     expect(usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))).to.eq(true);
//   });
// });

// makeSuite('Liquidator', (testEnv: TestEnv) => {
//   it('call liquidator', async () => {
//     const { liquidator, deployer, usdc, WFTM, yvwftm } = testEnv;
//     const ethers = (DRE as any).ethers;
//     const abiEncoder = new ethers.utils.AbiCoder();
//     const encodedData = abiEncoder.encode(
//       ["address", "address"],
//       [WFTM.address, deployer.address]
//     );
//     // set liquidation threshold 35%
//     await impersonateAccountsHardhat(['0x154D73802a6B3324c017481AC818050afE4a0b0A']);
//     let signer = await ethers.provider.getSigner('0x154D73802a6B3324c017481AC818050afE4a0b0A');
//     const configurator = await getLendingPoolConfiguratorProxy();
//     await configurator.connect(signer).configureReserveAsCollateral(yvwftm.address, '3000', '3500', '10500');

//     // process liquidation by using flashloan contract
//     await liquidator.liquidation(usdc.address, await convertToCurrencyDecimals(usdc.address, '100'), encodedData);
    
//     // withdraw remained usdc from flashloan contract
//     const beforeUsdcBalance = await usdc.balanceOf(deployer.address);
//     await liquidator.connect(deployer.signer).withdraw(usdc.address);
//     const usdcBalance = await usdc.balanceOf(deployer.address);
//     expect(usdcBalance.sub(beforeUsdcBalance).gt(await convertToCurrencyDecimals(usdc.address, '0.03'))).to.eq(true);

//     // retry liquidation should be failed
//     await expect(liquidator.liquidation(usdc.address, await convertToCurrencyDecimals(usdc.address, '100'), encodedData)).to.be.reverted;
//   });
// });