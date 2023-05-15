// /**
//  * @dev test for StaticAToken functions
//  */

// import { expect } from 'chai';
// import { makeSuite, TestEnv, SignerWithAddress } from './helpers/make-suite';
// import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
// import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';

// const mint = async (
//   reserveSymbol: string,
//   amount: string,
//   user: SignerWithAddress,
//   testEnv: TestEnv
// ) => {
//   const { weth } = testEnv;
//   const ethers = (DRE as any).ethers;
//   let ownerAddress;
//   let token;

//   if (reserveSymbol == 'WETH') {
//     ownerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
//     token = weth;
//   }

//   await impersonateAccountsHardhat([ownerAddress]);
//   const signer = await ethers.provider.getSigner(ownerAddress);
//   await waitForTx(await token.connect(signer).transfer(user.address, amount));
// };

// makeSuite('StaticAToken with underlying - Deposit & Withdraw', (testEnv: TestEnv) => {
//   it('check USDC, USDT, DAI symbol', async () => {
//     const { staticAWeth, users } = testEnv;
//     const depositor = users[1];
//     expect(await staticAWeth.connect(depositor.signer).symbol()).to.be.equal('sWETH');
//   });

//   it('check WETH - Deposit & withdraw', async () => {
//     const { staticAWeth, weth, aWeth, users } = testEnv;
//     const depositor = users[1];
//     const depositAmount = (await convertToCurrencyDecimals(weth.address, '1')).toString();

//     // Prepare WETH
//     await mint('WETH', depositAmount, depositor, testEnv);
//     expect(await weth.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await staticAWeth.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);

//     // Depositing
//     await weth.connect(depositor.signer).approve(staticAWeth.address, depositAmount);
//     await waitForTx(
//       await staticAWeth.connect(depositor.signer).deposit(depositor.address, depositAmount, 0, true)
//     );
//     expect(await weth.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aWeth.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aWeth.balanceOf(staticAWeth.address)).to.be.equal(depositAmount);
//     expect(await staticAWeth.connect(depositor.signer).balanceOf(depositor.address)).to.be.gt(0);

//     // Withdrawing.
//     await waitForTx(
//       await staticAWeth.connect(depositor.signer).withdraw(depositor.address, depositAmount, true)
//     );
//     expect(await weth.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await aWeth.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aWeth.balanceOf(staticAWeth.address)).to.be.equal(0);
//     expect(await staticAWeth.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);
//   });
// });

// makeSuite('StaticAToken with AToken - Deposit & Withdraw', (testEnv: TestEnv) => {
//   it('check WETH - Deposit & withdraw', async () => {
//     const { staticAWeth, weth, aWeth, pool, users } = testEnv;
//     const depositor = users[1];
//     const depositAmount = (await convertToCurrencyDecimals(weth.address, '1')).toString();

//     // Prepare WETH
//     await mint('WETH', depositAmount, depositor, testEnv);
//     expect(await weth.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await aWeth.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await staticAWeth.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);

//     // Depositing lending pool
//     await weth.connect(depositor.signer).approve(pool.address, depositAmount);
//     await pool.connect(depositor.signer).deposit(weth.address, depositAmount, depositor.address, 0);
//     expect(await aWeth.balanceOf(depositor.address)).to.be.gt(0);

//     // Depositing
//     await aWeth.connect(depositor.signer).approve(staticAWeth.address, depositAmount);
//     await waitForTx(
//       await staticAWeth.connect(depositor.signer).deposit(depositor.address, depositAmount, 0, false)
//     );
//     expect(await weth.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aWeth.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aWeth.balanceOf(staticAWeth.address)).to.be.equal(depositAmount);
//     expect(await staticAWeth.connect(depositor.signer).balanceOf(depositor.address)).to.be.gt(0);

//     // Withdrawing.
//     await waitForTx(
//       await staticAWeth.connect(depositor.signer).withdraw(depositor.address, depositAmount, true)
//     );
//     expect(await weth.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await aWeth.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aWeth.balanceOf(staticAWeth.address)).to.be.equal(0);
//     expect(await staticAWeth.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);
//   });
// });
