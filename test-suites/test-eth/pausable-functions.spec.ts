import { makeSuite, TestEnv } from './helpers/make-suite';
import { ProtocolErrors } from '../../helpers/types';
import { APPROVAL_AMOUNT_LENDING_POOL } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { DRE, impersonateAccountsHardhat } from '../../helpers/misc-utils';

const { expect } = require('chai');

makeSuite('Pausable Pool', (testEnv: TestEnv) => {
  const { LP_IS_PAUSED, INVALID_FROM_BALANCE_AFTER_TRANSFER, INVALID_TO_BALANCE_AFTER_TRANSFER } =
    ProtocolErrors;

  it('User 0 deposits 2 WETH. Configurator pauses pool. Transfers to user 1 reverts. Configurator unpauses the network and next transfer succees', async () => {
    const { users, pool, weth, aWeth, configurator, emergencyUser, deployer } = testEnv;
    const ethers = (DRE as any).ethers;
    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    await impersonateAccountsHardhat([wethOwnerAddress]);
    const signer = await ethers.provider.getSigner(wethOwnerAddress);
    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, '2');
    
    await weth.connect(signer).transfer(deployer.address, amountWETHtoDeposit);
    await weth.connect(deployer.signer).transfer(users[1].address, amountWETHtoDeposit);

    // user 0 deposits 2 WETH
    await weth.connect(users[1].signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);
    await pool
      .connect(users[1].signer)
      .deposit(weth.address, amountWETHtoDeposit, users[1].address, '0');

    const user0Balance = await aWeth.balanceOf(users[1].address);
    const user1Balance = await aWeth.balanceOf(emergencyUser.address);

    // Configurator pauses the pool
    await configurator.connect(emergencyUser.signer).setPoolPause(true);

    // User 0 tries the transfer to User 1
    await expect(
      aWeth.connect(users[1].signer).transfer(emergencyUser.address, amountWETHtoDeposit)
    ).to.revertedWith(LP_IS_PAUSED);

    const pausedFromBalance = await aWeth.balanceOf(users[1].address);
    const pausedToBalance = await aWeth.balanceOf(emergencyUser.address);

    expect(pausedFromBalance).to.be.equal(
      user0Balance.toString(),
      INVALID_TO_BALANCE_AFTER_TRANSFER
    );
    expect(pausedToBalance.toString()).to.be.equal(
      user1Balance.toString(),
      INVALID_FROM_BALANCE_AFTER_TRANSFER
    );

    // Configurator unpauses the pool
    await configurator.connect(emergencyUser.signer).setPoolPause(false);

    // User 0 succeeds transfer to User 1
    await aWeth.connect(users[1].signer).transfer(emergencyUser.address, amountWETHtoDeposit);

    const fromBalance = await aWeth.balanceOf(users[1].address);
    const toBalance = await aWeth.balanceOf(emergencyUser.address);

    expect(fromBalance.toString()).to.be.equal(
      user0Balance.sub(amountWETHtoDeposit),
      INVALID_FROM_BALANCE_AFTER_TRANSFER
    );
    expect(toBalance.toString()).to.be.equal(
      user1Balance.add(amountWETHtoDeposit),
      INVALID_TO_BALANCE_AFTER_TRANSFER
    );
  });

  it('Deposit', async () => {
    const { users, pool, weth, aWeth, configurator, emergencyUser, deployer } = testEnv;

    const ethers = (DRE as any).ethers;
    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    await impersonateAccountsHardhat([wethOwnerAddress]);
    const signer = await ethers.provider.getSigner(wethOwnerAddress);
    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, '2');

    await weth.connect(signer).transfer(deployer.address, amountWETHtoDeposit);
    await weth.connect(deployer.signer).transfer(users[1].address, amountWETHtoDeposit);

    // user 0 deposits 2 WETH
    await weth.connect(users[1].signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

    // Configurator pauses the pool
    await configurator.connect(emergencyUser.signer).setPoolPause(true);
    await expect(
      pool.connect(users[1].signer).deposit(weth.address, amountWETHtoDeposit, users[1].address, '0')
    ).to.revertedWith(LP_IS_PAUSED);

    // Configurator unpauses the pool
    await configurator.connect(emergencyUser.signer).setPoolPause(false);
  });

  it('Withdraw', async () => {
    const { users, pool, weth, aWeth, configurator, emergencyUser, deployer } = testEnv;

    const ethers = (DRE as any).ethers;
    const wethOwnerAddress = '0x8EB8a3b98659Cce290402893d0123abb75E3ab28';
    await impersonateAccountsHardhat([wethOwnerAddress]);
    const signer = await ethers.provider.getSigner(wethOwnerAddress);
    const amountWETHtoDeposit = await convertToCurrencyDecimals(weth.address, '2');

    await weth.connect(signer).transfer(deployer.address, amountWETHtoDeposit);

    await weth.connect(deployer.signer).transfer(users[1].address, amountWETHtoDeposit);

    // user 0 deposits 2 WETH
    await weth.connect(users[1].signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);
    await pool
      .connect(users[1].signer)
      .deposit(weth.address, amountWETHtoDeposit, users[1].address, '0');

    // Configurator pauses the pool
    await configurator.connect(emergencyUser.signer).setPoolPause(true);

    // user tries to burn
    await expect(
      pool.connect(users[1].signer).withdraw(weth.address, amountWETHtoDeposit, users[1].address)
    ).to.revertedWith(LP_IS_PAUSED);

    // Configurator unpauses the pool
    await configurator.connect(emergencyUser.signer).setPoolPause(false);
  });

  it('Borrow', async () => {
    const { pool, weth, users, configurator, emergencyUser } = testEnv;

    const user = emergencyUser;
    // Pause the pool
    await configurator.connect(emergencyUser.signer).setPoolPause(true);

    // Try to execute liquidation
    await expect(
      pool.connect(user.signer).borrow(weth.address, '1', '1', '0', user.address)
    ).revertedWith(LP_IS_PAUSED);

    // Unpause the pool
    await configurator.connect(emergencyUser.signer).setPoolPause(false);
  });

  it('Repay', async () => {
    const { pool, weth, users, configurator, emergencyUser } = testEnv;

    const user = emergencyUser;
    // Pause the pool
    await configurator.connect(emergencyUser.signer).setPoolPause(true);

    // Try to execute liquidation
    await expect(pool.connect(user.signer).repay(weth.address, '1', '1', user.address)).revertedWith(
      LP_IS_PAUSED
    );

    // Unpause the pool
    await configurator.connect(emergencyUser.signer).setPoolPause(false);
  });

  // it('Liquidation call', async () => {
  //   const {
  //     users,
  //     pool,
  //     usdc,
  //     oracle,
  //     lido,
  //     configurator,
  //     helpersContract,
  //     lidoVault,
  //     deployer,
  //     emergencyUser,
  //   } = testEnv;
  //   const depositor = users[3];
  //   const borrower = users[4];

  //   const ethers = (DRE as any).ethers;
  //   const usdcOwnerAddress = '0x6dBe810e3314546009bD6e1B29f9031211CdA5d2';
  //   await impersonateAccountsHardhat([usdcOwnerAddress]);
  //   let signer = await ethers.provider.getSigner(usdcOwnerAddress);
  //   await usdc
  //     .connect(signer)
  //     .transfer(depositor.address, await convertToCurrencyDecimals(usdc.address, '2'));

  //   //approve protocol to access depositor wallet
  //   await usdc.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

  //   //user 3 deposits 2 USDC
  //   const amountUSDCtoDeposit = await convertToCurrencyDecimals(usdc.address, '2');

  //   await pool
  //     .connect(depositor.signer)
  //     .deposit(usdc.address, amountUSDCtoDeposit, depositor.address, '0');

  //   //user 4 deposits 1 ETH
  //   const amountETHtoDeposit = await convertToCurrencyDecimals(lido.address, '1');
  //   const stETHOwnerAddress = '0x06F405e5a760b8cDE3a48F96105659CEDf62dA63';
  //   await impersonateAccountsHardhat([stETHOwnerAddress]);
  //   signer = await ethers.provider.getSigner(stETHOwnerAddress);
  //   await lido.connect(signer).transfer(borrower.address, amountETHtoDeposit);

  //   //approve protocol to access the borrower wallet
  //   await lido.connect(borrower.signer).approve(lidoVault.address, APPROVAL_AMOUNT_LENDING_POOL);

  //   await lidoVault.connect(borrower.signer).depositCollateral(lido.address, amountETHtoDeposit);

  //   //user 4 borrows
  //   const userGlobalData = await pool.getUserAccountData(borrower.address);

  //   const usdcPrice = await oracle.getAssetPrice(usdc.address);

  //   const amountUSDCToBorrow = await convertToCurrencyDecimals(
  //     usdc.address,
  //     new BigNumber(userGlobalData.availableBorrowsETH.toString())
  //       .div(usdcPrice.toString())
  //       .multipliedBy(0.9502)
  //       .toFixed(0)
  //   );

  //   await pool
  //     .connect(borrower.signer)
  //     .borrow(usdc.address, amountUSDCToBorrow, RateMode.Variable, '0', borrower.address);

  //   // Drops HF below 1
  //   await oracle
  //     .connect(deployer.signer)
  //     .setAssetPrice(
  //       usdc.address,
  //       new BigNumber(usdcPrice.toString()).multipliedBy(1.2).toFixed(0)
  //     );

  //   //mints usdc to the liquidator
  //   await impersonateAccountsHardhat([usdcOwnerAddress]);
  //   signer = await ethers.provider.getSigner(usdcOwnerAddress);
  //   await usdc
  //     .connect(signer)
  //     .transfer(deployer.address, await convertToCurrencyDecimals(usdc.address, '2'));
  //   await usdc.connect(deployer.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

  //   const userReserveDataBefore = await helpersContract.getUserReserveData(
  //     usdc.address,
  //     borrower.address
  //   );

  //   const amountToLiquidate = new BigNumber(userReserveDataBefore.currentStableDebt.toString())
  //     .multipliedBy(0.5)
  //     .toFixed(0);

  //   // Pause pool
  //   await configurator.connect(emergencyUser.signer).setPoolPause(true);

  //   // Do liquidation
  //   await expect(
  //     pool
  //       .connect(deployer.signer)
  //       .liquidationCall(lido.address, usdc.address, borrower.address, amountToLiquidate, true)
  //   ).revertedWith(LP_IS_PAUSED);

  //   // Unpause pool
  //   await configurator.connect(emergencyUser.signer).setPoolPause(false);
  // });

  //   it('SwapBorrowRateMode', async () => {
  //     const { pool, weth, weth, usdc, users, configurator, emergencyUser } = testEnv;
  //     const user = emergencyUser;
  //     const amountWETHToDeposit = parseEther('10');
  //     const amountWETHToDeposit = parseEther('120');
  //     const amountToBorrow = parseUnits('65', 6);

  //     await weth.connect(user.signer).mint(amountWETHToDeposit);
  //     await weth.connect(user.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);
  //     await pool.connect(user.signer).deposit(weth.address, amountWETHToDeposit, user.address, '0');

  //     await weth.connect(user.signer).mint(amountWETHToDeposit);
  //     await weth.connect(user.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);
  //     await pool.connect(user.signer).deposit(weth.address, amountWETHToDeposit, user.address, '0');

  //     await pool.connect(user.signer).borrow(usdc.address, amountToBorrow, 2, 0, user.address);

  //     // Pause pool
  //     await configurator.connect(emergencyUser.signer).setPoolPause(true);

  //     // Try to repay
  //     await expect(
  //       pool.connect(user.signer).swapBorrowRateMode(usdc.address, RateMode.Stable)
  //     ).revertedWith(LP_IS_PAUSED);

  //     // Unpause pool
  //     await configurator.connect(emergencyUser.signer).setPoolPause(false);
  //   });

  // it('RebalanceStableBorrowRate', async () => {
  //   const { pool, weth, users, configurator, emergencyUser } = testEnv;
  //   const user = emergencyUser;
  //   // Pause pool
  //   await configurator.connect(emergencyUser.signer).setPoolPause(true);

  //   await expect(
  //     pool.connect(user.signer).rebalanceStableBorrowRate(weth.address, user.address)
  //   ).revertedWith(LP_IS_PAUSED);

  //   // Unpause pool
  //   await configurator.connect(emergencyUser.signer).setPoolPause(false);
  // });

  //   it('setUserUseReserveAsCollateral', async () => {
  //     const { pool, weth, users, configurator, emergencyUser } = testEnv;
  //     const user = emergencyUser;

  //     const amountWETHToDeposit = parseEther('1');
  //     await weth.connect(user.signer).mint(amountWETHToDeposit);
  //     await weth.connect(user.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);
  //     await pool.connect(user.signer).deposit(weth.address, amountWETHToDeposit, user.address, '0');

  //     // Pause pool
  //     await configurator.connect(emergencyUser.signer).setPoolPause(true);

  //     await expect(
  //       pool.connect(user.signer).setUserUseReserveAsCollateral(weth.address, false)
  //     ).revertedWith(LP_IS_PAUSED);

  //     // Unpause pool
  //     await configurator.connect(emergencyUser.signer).setPoolPause(false);
  //   });
});
