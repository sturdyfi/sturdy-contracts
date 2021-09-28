import BigNumber from 'bignumber.js';

import { DRE } from '../../helpers/misc-utils';
import { APPROVAL_AMOUNT_LENDING_POOL, oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite } from './helpers/make-suite';
import { ProtocolErrors, RateMode } from '../../helpers/types';
import { calcExpectedVariableDebtTokenBalance } from './helpers/utils/calculations';
import { getUserData, getReserveData, printUserAccountData, ETHfromWei, printDivider } from './helpers/utils/helpers';

const chai = require('chai');
const { expect } = chai;

makeSuite('borrow stETH', (testEnv) => {
    const {
        LPCM_HEALTH_FACTOR_NOT_BELOW_THRESHOLD,
        INVALID_HF,
        LPCM_SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER,
        LPCM_COLLATERAL_CANNOT_BE_LIQUIDATED,
        LP_IS_PAUSED,
    } = ProtocolErrors;
    it('Should revert if borrow stETH. User1 deposits stETH, User2 deposits weth as collatoral and borrows stETH', async () => {
        const { stETH, dai, weth, users, pool, oracle } = testEnv;
        const depositor = users[0];
        const borrower = users[1];
        printDivider()
        //mints stETH to depositor
        await stETH.connect(depositor.signer).mint(await convertToCurrencyDecimals(stETH.address, '1000'));

        //approve protocol to access depositor wallet
        await stETH.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

        //user 1 deposits 1000 stETH
        const amountStETHtoDeposit = await convertToCurrencyDecimals(stETH.address, '1000');

        await pool
            .connect(depositor.signer)
            .deposit(stETH.address, amountStETHtoDeposit, depositor.address, '0', true);

        const depositorGlobalData = await pool.getUserAccountData(depositor.address);
        printUserAccountData({ user: `Suplier ${depositor.address}`, action: 'deposits', amount: ETHfromWei(amountStETHtoDeposit), coin: 'stETH', ...depositorGlobalData })

        //user 2 deposits 1 ETH
        const amountETHtoDeposit = await convertToCurrencyDecimals(weth.address, '1');

        //mints WETH to borrower
        await weth.connect(borrower.signer).mint(await convertToCurrencyDecimals(weth.address, '1000'));

        //approve protocol to access the borrower wallet
        await weth.connect(borrower.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

        await pool
            .connect(borrower.signer)
            .deposit(weth.address, amountETHtoDeposit, borrower.address, '0', false);

        const borrowerGlobalData = await pool.getUserAccountData(depositor.address);
        printUserAccountData({ user: `Borrower ${borrower.address}`, action: 'deposits', amount: ETHfromWei(amountETHtoDeposit), coin: 'weth', ...borrowerGlobalData })
        //user 2 borrows

        const userGlobalData = await pool.getUserAccountData(borrower.address);
        const daiPrice = await oracle.getAssetPrice(stETH.address);

        const amountstETHToBorrow = await convertToCurrencyDecimals(
            stETH.address,
            new BigNumber(userGlobalData.availableBorrowsETH.toString())
                .div(daiPrice.toString())
                .multipliedBy(0.95)
                .toFixed(0)
        );
        //todo: set less amount to borrow
        await expect(pool
            .connect(borrower.signer)
            .borrow(stETH.address, amountstETHToBorrow, RateMode.Stable, '0', borrower.address)).to.be.reverted;

        {
            const borrowerGlobalData = await pool.getUserAccountData(depositor.address);
            printUserAccountData({ user: `Borrower ${borrower.address}`, action: 'borrows', amount: ETHfromWei(amountstETHToBorrow), coin: 'stETH', ...borrowerGlobalData })
        }

    });


});
