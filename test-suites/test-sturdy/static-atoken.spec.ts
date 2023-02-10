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
//   const { usdc, dai, usdt } = testEnv;
//   const ethers = (DRE as any).ethers;
//   let ownerAddress;
//   let token;

//   if (reserveSymbol == 'USDC') {
//     ownerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
//     token = usdc;
//   } else if (reserveSymbol == 'DAI') {
//     ownerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
//     token = dai;
//   } else if (reserveSymbol == 'USDT') {
//     ownerAddress = '0x28C6c06298d514Db089934071355E5743bf21d60';
//     token = usdt;
//   }

//   await impersonateAccountsHardhat([ownerAddress]);
//   const signer = await ethers.provider.getSigner(ownerAddress);
//   await waitForTx(await token.connect(signer).transfer(user.address, amount));
// };

// makeSuite('StaticAToken with underlying - Deposit & Withdraw', (testEnv: TestEnv) => {
//   it('check USDC, USDT, DAI symbol', async () => {
//     const { staticADai, staticAUsdc, staticAUsdt, users } = testEnv;
//     const depositor = users[1];
//     expect(await staticADai.connect(depositor.signer).symbol()).to.be.equal('sDAI');
//     expect(await staticAUsdc.connect(depositor.signer).symbol()).to.be.equal('sUSDC');
//     expect(await staticAUsdt.connect(depositor.signer).symbol()).to.be.equal('sUSDT');
//   });

//   it('check DAI - Deposit & withdraw', async () => {
//     const { staticADai, dai, aDai, users } = testEnv;
//     const depositor = users[1];
//     const depositAmount = (await convertToCurrencyDecimals(dai.address, '1000')).toString();

//     // Prepare DAI
//     await mint('DAI', depositAmount, depositor, testEnv);
//     expect(await dai.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await staticADai.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);

//     // Depositing
//     await dai.connect(depositor.signer).approve(staticADai.address, depositAmount);
//     await waitForTx(
//       await staticADai.connect(depositor.signer).deposit(depositor.address, depositAmount, 0, true)
//     );
//     expect(await dai.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aDai.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aDai.balanceOf(staticADai.address)).to.be.equal(depositAmount);
//     expect(await staticADai.connect(depositor.signer).balanceOf(depositor.address)).to.be.gt(0);

//     // Withdrawing.
//     await waitForTx(
//       await staticADai.connect(depositor.signer).withdraw(depositor.address, depositAmount, true)
//     );
//     expect(await dai.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await aDai.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aDai.balanceOf(staticADai.address)).to.be.equal(0);
//     expect(await staticADai.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);
//   });

//   it('check USDC - Deposit & withdraw', async () => {
//     const { staticAUsdc, usdc, aUsdc, users } = testEnv;
//     const depositor = users[2];
//     const depositAmount = (await convertToCurrencyDecimals(usdc.address, '1000')).toString();

//     // Prepare USDC
//     await mint('USDC', depositAmount, depositor, testEnv);
//     expect(await usdc.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await staticAUsdc.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);

//     // Depositing
//     await usdc.connect(depositor.signer).approve(staticAUsdc.address, depositAmount);
//     await waitForTx(
//       await staticAUsdc.connect(depositor.signer).deposit(depositor.address, depositAmount, 0, true)
//     );
//     expect(await usdc.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdc.balanceOf(staticAUsdc.address)).to.be.equal(depositAmount);
//     expect(await staticAUsdc.connect(depositor.signer).balanceOf(depositor.address)).to.be.gt(0);

//     // Withdrawing.
//     await waitForTx(
//       await staticAUsdc.connect(depositor.signer).withdraw(depositor.address, depositAmount, true)
//     );
//     expect(await usdc.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdc.balanceOf(staticAUsdc.address)).to.be.equal(0);
//     expect(await staticAUsdc.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);
//   });

//   it('check USDT - Deposit & withdraw', async () => {
//     const { staticAUsdt, usdt, aUsdt, users } = testEnv;
//     const depositor = users[3];
//     const depositAmount = (await convertToCurrencyDecimals(usdt.address, '1000')).toString();

//     // Prepare USDT
//     await mint('USDT', depositAmount, depositor, testEnv);
//     expect(await usdt.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await staticAUsdt.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);

//     // Depositing
//     await usdt.connect(depositor.signer).approve(staticAUsdt.address, depositAmount);
//     await waitForTx(
//       await staticAUsdt.connect(depositor.signer).deposit(depositor.address, depositAmount, 0, true)
//     );
//     expect(await usdt.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdt.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdt.balanceOf(staticAUsdt.address)).to.be.equal(depositAmount);
//     expect(await staticAUsdt.connect(depositor.signer).balanceOf(depositor.address)).to.be.gt(0);

//     // Withdrawing.
//     await waitForTx(
//       await staticAUsdt.connect(depositor.signer).withdraw(depositor.address, depositAmount, true)
//     );
//     expect(await usdt.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await aUsdt.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdt.balanceOf(staticAUsdt.address)).to.be.equal(0);
//     expect(await staticAUsdt.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);
//   });
// });

// makeSuite('StaticAToken with AToken - Deposit & Withdraw', (testEnv: TestEnv) => {
//   it('check DAI - Deposit & withdraw', async () => {
//     const { staticADai, dai, aDai, pool, users } = testEnv;
//     const depositor = users[1];
//     const depositAmount = (await convertToCurrencyDecimals(dai.address, '1000')).toString();

//     // Prepare DAI
//     await mint('DAI', depositAmount, depositor, testEnv);
//     expect(await dai.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await aDai.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await staticADai.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);

//     // Depositing lending pool
//     await dai.connect(depositor.signer).approve(pool.address, depositAmount);
//     await pool.connect(depositor.signer).deposit(dai.address, depositAmount, depositor.address, 0);
//     expect(await aDai.balanceOf(depositor.address)).to.be.gt(0);

//     // Depositing
//     await aDai.connect(depositor.signer).approve(staticADai.address, depositAmount);
//     await waitForTx(
//       await staticADai.connect(depositor.signer).deposit(depositor.address, depositAmount, 0, false)
//     );
//     expect(await dai.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aDai.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aDai.balanceOf(staticADai.address)).to.be.equal(depositAmount);
//     expect(await staticADai.connect(depositor.signer).balanceOf(depositor.address)).to.be.gt(0);

//     // Withdrawing.
//     await waitForTx(
//       await staticADai.connect(depositor.signer).withdraw(depositor.address, depositAmount, true)
//     );
//     expect(await dai.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await aDai.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aDai.balanceOf(staticADai.address)).to.be.equal(0);
//     expect(await staticADai.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);
//   });

//   it('check USDC - Deposit & withdraw', async () => {
//     const { staticAUsdc, usdc, aUsdc, pool, users } = testEnv;
//     const depositor = users[2];
//     const depositAmount = (await convertToCurrencyDecimals(usdc.address, '1000')).toString();

//     // Prepare USDC
//     await mint('USDC', depositAmount, depositor, testEnv);
//     expect(await usdc.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await staticAUsdc.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);

//     // Depositing lending pool
//     await usdc.connect(depositor.signer).approve(pool.address, depositAmount);
//     await pool.connect(depositor.signer).deposit(usdc.address, depositAmount, depositor.address, 0);
//     expect(await aUsdc.balanceOf(depositor.address)).to.be.gt(0);

//     // Depositing
//     await aUsdc.connect(depositor.signer).approve(staticAUsdc.address, depositAmount);
//     await waitForTx(
//       await staticAUsdc
//         .connect(depositor.signer)
//         .deposit(depositor.address, depositAmount, 0, false)
//     );
//     expect(await usdc.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdc.balanceOf(staticAUsdc.address)).to.be.equal(depositAmount);
//     expect(await staticAUsdc.connect(depositor.signer).balanceOf(depositor.address)).to.be.gt(0);

//     // Withdrawing.
//     await waitForTx(
//       await staticAUsdc.connect(depositor.signer).withdraw(depositor.address, depositAmount, true)
//     );
//     expect(await usdc.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await aUsdc.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdc.balanceOf(staticAUsdc.address)).to.be.equal(0);
//     expect(await staticAUsdc.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);
//   });

//   it('check USDT - Deposit & withdraw', async () => {
//     const { staticAUsdt, usdt, aUsdt, pool, users } = testEnv;
//     const depositor = users[3];
//     const depositAmount = (await convertToCurrencyDecimals(usdt.address, '1000')).toString();

//     // Prepare USDT
//     await mint('USDT', depositAmount, depositor, testEnv);
//     expect(await usdt.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await staticAUsdt.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);

//     // Depositing lending pool
//     await usdt.connect(depositor.signer).approve(pool.address, depositAmount);
//     await pool.connect(depositor.signer).deposit(usdt.address, depositAmount, depositor.address, 0);
//     expect(await aUsdt.balanceOf(depositor.address)).to.be.gt(0);

//     // Depositing
//     await aUsdt.connect(depositor.signer).approve(staticAUsdt.address, depositAmount);
//     await waitForTx(
//       await staticAUsdt
//         .connect(depositor.signer)
//         .deposit(depositor.address, depositAmount, 0, false)
//     );
//     expect(await usdt.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdt.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdt.balanceOf(staticAUsdt.address)).to.be.equal(depositAmount);
//     expect(await staticAUsdt.connect(depositor.signer).balanceOf(depositor.address)).to.be.gt(0);

//     // Withdrawing.
//     await waitForTx(
//       await staticAUsdt.connect(depositor.signer).withdraw(depositor.address, depositAmount, true)
//     );
//     expect(await usdt.balanceOf(depositor.address)).to.be.equal(depositAmount);
//     expect(await aUsdt.balanceOf(depositor.address)).to.be.equal(0);
//     expect(await aUsdt.balanceOf(staticAUsdt.address)).to.be.equal(0);
//     expect(await staticAUsdt.connect(depositor.signer).balanceOf(depositor.address)).to.be.equal(0);
//   });
// });
