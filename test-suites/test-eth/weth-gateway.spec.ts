import { APPROVAL_AMOUNT_LENDING_POOL, MAX_UINT_AMOUNT } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite, TestEnv } from './helpers/make-suite';
import { parseEther } from 'ethers/lib/utils';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { BigNumber } from 'ethers';
import { getStableDebtToken, getVariableDebtToken } from '../../helpers/contracts-getters';
import { RateMode } from '../../helpers/types';

const { expect } = require('chai');

makeSuite('Use native ETH at LendingPool via WETHGateway', (testEnv: TestEnv) => {
  const zero = BigNumber.from('0');
  const depositSize = parseEther('2');
  it('Deposit WETH via WethGateway', async () => {
    const { users, wethGateway, aWeth, pool } = testEnv;

    const user = users[1];
    const depositor = users[0];

    // Deposit liquidity with native ETH
    await wethGateway
      .connect(depositor.signer)
      .depositETH(pool.address, depositor.address, '0', { value: depositSize });

    // Deposit with native ETH
    await wethGateway
      .connect(user.signer)
      .depositETH(pool.address, user.address, '0', { value: depositSize });

    const aTokensBalance = await aWeth.balanceOf(user.address);

    expect(aTokensBalance).to.be.gt(zero);
    expect(aTokensBalance).to.be.gte(depositSize);
  });

  it('Withdraw WETH - Partial', async () => {
    const { users, wethGateway, aWeth, pool } = testEnv;

    const user = users[1];
    const priorEthersBalance = await user.signer.getBalance();
    const aTokensBalance = await aWeth.balanceOf(user.address);

    expect(aTokensBalance).to.be.gt(zero, 'User should have aTokens.');

    // Partially withdraw native ETH
    const partialWithdraw = await convertToCurrencyDecimals(aWeth.address, '1');

    // Approve the aTokens to Gateway so Gateway can withdraw and convert to Ether
    const approveTx = await aWeth
      .connect(user.signer)
      .approve(wethGateway.address, MAX_UINT_AMOUNT);
    const { gasUsed: approveGas } = await waitForTx(approveTx);

    // Partial Withdraw and send native Ether to user
    const { gasUsed: withdrawGas } = await waitForTx(
      await wethGateway
        .connect(user.signer)
        .withdrawETH(pool.address, partialWithdraw, user.address)
    );

    const afterPartialEtherBalance = await user.signer.getBalance();
    const afterPartialATokensBalance = await aWeth.balanceOf(user.address);
    const gasCosts = approveGas.add(withdrawGas).mul(approveTx.gasPrice || '0');

    expect(afterPartialEtherBalance).to.be.equal(
      priorEthersBalance.add(partialWithdraw).sub(gasCosts),
      'User ETHER balance should contain the partial withdraw'
    );
    expect(afterPartialATokensBalance).to.be.equal(
      aTokensBalance.sub(partialWithdraw),
      'User aWeth balance should be substracted'
    );
  });

  it('Withdraw WETH - Full', async () => {
    const { users, aWeth, wethGateway, pool } = testEnv;

    const user = users[1];
    const priorEthersBalance = await user.signer.getBalance();
    const aTokensBalance = await aWeth.balanceOf(user.address);

    expect(aTokensBalance).to.be.gt(zero, 'User should have aTokens.');

    // Approve the aTokens to Gateway so Gateway can withdraw and convert to Ether
    const approveTx = await aWeth
      .connect(user.signer)
      .approve(wethGateway.address, MAX_UINT_AMOUNT);
    const { gasUsed: approveGas } = await waitForTx(approveTx);

    // Full withdraw
    const { gasUsed: withdrawGas } = await waitForTx(
      await wethGateway
        .connect(user.signer)
        .withdrawETH(pool.address, MAX_UINT_AMOUNT, user.address)
    );

    const afterFullEtherBalance = await user.signer.getBalance();
    const afterFullATokensBalance = await aWeth.balanceOf(user.address);
    const gasCosts = approveGas.add(withdrawGas).mul(approveTx.gasPrice || '0');

    expect(afterFullEtherBalance).to.be.eq(
      priorEthersBalance.add(aTokensBalance).sub(gasCosts),
      'User ETHER balance should contain the full withdraw'
    );
    expect(afterFullATokensBalance).to.be.eq(0, 'User aWeth balance should be zero');
  });

  it('Borrow variable WETH and Full Repay with ETH', async () => {
    const { users, wethGateway, aCVXETH_STETH, convexETHSTETHVault, weth, ETH_STETH_LP, pool, helpersContract } = testEnv;
    const borrowSize = parseEther('1');
    const repaySize = borrowSize.add(borrowSize.mul(5).div(100));
    const ethers = (DRE as any).ethers;
    const user = users[1];
    const depositor = users[0];

    // Deposit with native ETH
    await wethGateway
      .connect(depositor.signer)
      .depositETH(pool.address, depositor.address, '0', { value: depositSize });

    const { variableDebtTokenAddress } = await helpersContract.getReserveTokensAddresses(
      weth.address
    );

    const variableDebtToken = await getVariableDebtToken(variableDebtTokenAddress);

    //user deposits 10 ETH_STETH_LP
    const ETH_STETH_LPOwnerAddress = '0x43378368D84D4bA00D1C8E97EC2E6016A82fC062';
    const amountETH_STETH_LP = await convertToCurrencyDecimals(ETH_STETH_LP.address, '10')
    //Make some test ETH_STETH_LP for depositor
    await impersonateAccountsHardhat([ETH_STETH_LPOwnerAddress]);
    const signer = await ethers.provider.getSigner(ETH_STETH_LPOwnerAddress);
    await ETH_STETH_LP.connect(signer).transfer(user.address, amountETH_STETH_LP);
    //approve protocol to access depositor wallet
    await ETH_STETH_LP.connect(user.signer).approve(convexETHSTETHVault.address, APPROVAL_AMOUNT_LENDING_POOL);

    await convexETHSTETHVault
      .connect(user.signer)
      .depositCollateral(ETH_STETH_LP.address, amountETH_STETH_LP);

    const aTokensBalance = await aCVXETH_STETH.balanceOf(user.address);

    expect(aTokensBalance).to.be.gt(zero);
    expect(aTokensBalance).to.be.gte(amountETH_STETH_LP);

    // Borrow WETH with WETH as collateral
    await waitForTx(
      await pool.connect(user.signer).borrow(weth.address, borrowSize, RateMode.Variable, '0', user.address)
    );

    const debtBalance = await variableDebtToken.balanceOf(user.address);

    expect(debtBalance).to.be.gt(zero);

    // Full Repay WETH with native ETH
    await waitForTx(
      await wethGateway
        .connect(user.signer)
        .repayETH(pool.address, MAX_UINT_AMOUNT, RateMode.Variable, user.address, { value: repaySize })
    );

    const debtBalanceAfterRepay = await variableDebtToken.balanceOf(user.address);
    expect(debtBalanceAfterRepay).to.be.eq(zero);
  });

  it('Borrow ETH via delegateApprove ETH and repays back', async () => {
    const { users, wethGateway, aWeth, weth, helpersContract, pool } = testEnv;
    const borrowSize = parseEther('1');
    const user = users[1];
    const { variableDebtTokenAddress } = await helpersContract.getReserveTokensAddresses(
      weth.address
    );
    const varDebtToken = await getVariableDebtToken(variableDebtTokenAddress);

    const priorDebtBalance = await varDebtToken.balanceOf(user.address);
    expect(priorDebtBalance).to.be.eq(zero);

    // Delegates borrowing power of WETH to WETHGateway
    await waitForTx(
      await varDebtToken.connect(user.signer).approveDelegation(wethGateway.address, borrowSize)
    );

    // Borrows ETH with WETH as collateral
    await waitForTx(
      await wethGateway.connect(user.signer).borrowETH(pool.address, borrowSize, RateMode.Variable, '0')
    );

    const debtBalance = await varDebtToken.balanceOf(user.address);

    expect(debtBalance).to.be.gt(zero);

    // Full Repay WETH loan with native ETH
    await waitForTx(
      await wethGateway
        .connect(user.signer)
        .repayETH(pool.address, MAX_UINT_AMOUNT, RateMode.Variable, user.address, { value: borrowSize.mul(2) })
    );
    const debtBalanceAfterFullRepay = await varDebtToken.balanceOf(user.address);
    expect(debtBalanceAfterFullRepay).to.be.eq(zero);
  });

  it('Should revert if receiver function receives Ether if not WETH', async () => {
    const { users, wethGateway } = testEnv;
    const user = users[0];
    const amount = parseEther('1');

    // Call receiver function (empty data + value)
    await expect(
      user.signer.sendTransaction({
        to: wethGateway.address,
        value: amount,
        gasLimit: DRE.network.config.gas,
      })
    ).to.be.revertedWith('Receive not allowed');
  });

  it('Should revert if fallback functions is called with Ether', async () => {
    const { users, wethGateway } = testEnv;
    const user = users[0];
    const amount = parseEther('1');
    const ethers = (DRE as any).ethers;
    const fakeABI = ['function wantToCallFallback()'];
    const abiCoder = new ethers.utils.Interface(fakeABI);
    const fakeMethodEncoded = abiCoder.encodeFunctionData('wantToCallFallback', []);

    // Call fallback function with value
    await expect(
      user.signer.sendTransaction({
        to: wethGateway.address,
        data: fakeMethodEncoded,
        value: amount,
        gasLimit: DRE.network.config.gas,
      })
    ).to.be.revertedWith('Fallback not allowed');
  });

  it('Should revert if fallback functions is called', async () => {
    const { users, wethGateway } = testEnv;
    const user = users[0];

    const fakeABI = ['function wantToCallFallback()'];
    const ethers = (DRE as any).ethers;
    const abiCoder = new ethers.utils.Interface(fakeABI);
    const fakeMethodEncoded = abiCoder.encodeFunctionData('wantToCallFallback', []);

    // Call fallback function without value
    await expect(
      user.signer.sendTransaction({
        to: wethGateway.address,
        data: fakeMethodEncoded,
        gasLimit: DRE.network.config.gas,
      })
    ).to.be.revertedWith('Fallback not allowed');
  });
});
