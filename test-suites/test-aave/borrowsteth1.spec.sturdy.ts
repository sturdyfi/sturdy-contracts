import BigNumber from 'bignumber.js';


import { DRE } from '../../helpers/misc-utils';
import { APPROVAL_AMOUNT_LENDING_POOL, oneEther } from '../../helpers/constants';
import { convertToCurrencyDecimals } from '../../helpers/contracts-helpers';
import { makeSuite } from './helpers/make-suite';
import { ProtocolErrors, RateMode } from '../../helpers/types';
import { calcExpectedVariableDebtTokenBalance } from './helpers/utils/calculations';
import { getUserData, getReserveData, printUserAccountData, ETHfromWei,printDivider } from './helpers/utils/helpers';

const chai = require('chai');
const { expect } = chai;



makeSuite('Deposit stETH as collatoral and other as for pool liquidity supplier ', (testEnv) => {
    const {
        LPCM_HEALTH_FACTOR_NOT_BELOW_THRESHOLD,
        INVALID_HF,
        LPCM_SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER,
        LPCM_COLLATERAL_CANNOT_BE_LIQUIDATED,
        LP_IS_PAUSED,
    } = ProtocolErrors;
    it('User1 deposits DAI, User deposits stETH as collatoral and borrows DAI', async () => {
        const { stETH, dai, weth, users, pool, oracle } = testEnv;
        const depositor = users[0];
        const borrower = users[1];
        printDivider()
        const depositDai = '1000';
        //mints DAI to depositor
        await dai.connect(depositor.signer).mint(await convertToCurrencyDecimals(dai.address, depositDai));

        //approve protocol to access depositor wallet
        await dai.connect(depositor.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

        //Supplier  deposits 1000 DAI
        const amountDAItoDeposit = await convertToCurrencyDecimals(dai.address, depositDai);
        await pool
            .connect(depositor.signer)
            .deposit(dai.address, amountDAItoDeposit, depositor.address, '0', false);

        const supplierGlobalData = await pool.getUserAccountData(depositor.address);
        printUserAccountData({ user: `Supplier ${depositor.address}`, action: 'deposited', amount: depositDai, coin: 'DAI', ...supplierGlobalData })


        const amountETHtoDeposit = await convertToCurrencyDecimals(stETH.address, '10');

        //mints WETH to borrower
        await stETH.connect(borrower.signer).mint(amountETHtoDeposit);

        //approve protocol to access borrower wallet
        await stETH.connect(borrower.signer).approve(pool.address, APPROVAL_AMOUNT_LENDING_POOL);

        //user 2 deposits 1 stETH
        await pool
            .connect(borrower.signer)
            .deposit(stETH.address, amountETHtoDeposit, borrower.address, '0', true);

        {
            const supplierGlobalData = await pool.getUserAccountData(borrower.address);
            printUserAccountData({ user: `Borrower ${borrower.address}`, action: 'deposited', amount: ETHfromWei(amountETHtoDeposit), coin: 'stETH', ...supplierGlobalData })
        }

        //user 2 borrows
        const userGlobalData = await pool.getUserAccountData(borrower.address);
        const daiPrice = await oracle.getAssetPrice(dai.address);

        const amountDAIToBorrow = await convertToCurrencyDecimals(
            dai.address,
            new BigNumber(userGlobalData.availableBorrowsETH.toString())
                .div(daiPrice.toString())
                .multipliedBy(0.95)
                .toFixed(0)
        );

        await pool
            .connect(borrower.signer)
            .borrow(dai.address, amountDAIToBorrow, RateMode.Variable, '0', borrower.address);

        const userGlobalDataAfter = await pool.getUserAccountData(borrower.address);
        printUserAccountData({ user: `Borrower ${borrower.address}`, action: 'borrowed', amount: amountDAIToBorrow, coin: 'Dai', ...userGlobalDataAfter })

        expect(userGlobalDataAfter.currentLiquidationThreshold.toString()).to.be.bignumber.equal(
            '6500',
            'Invalid liquidation threshold'
        );
    });
});
