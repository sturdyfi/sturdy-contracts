import { SignerWithAddress, TestEnv, makeSuite } from './helpers/make-suite';
import { mint } from './helpers/mint';
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../../helpers/constants';
import { convertToCurrencyDecimals, convertToCurrencyUnits } from '../../helpers/contracts-helpers';
import {
  ICurvePool__factory,
  IGeneralLevSwap,
  IGeneralLevSwap__factory,
  MintableERC20,
  MintableERC20__factory,
  StableStructuredVault,
} from '../../types';
import { deployStableStructuredVault } from '../../helpers/contracts-deployments';
import { parseEther } from 'ethers/lib/utils';
import { tEthereumAddress } from '../../helpers/types';
import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';

const chai = require('chai');
const { expect } = chai;

const slippage = 0.0002; //0.02%
const FRAX_USDC_LP = '0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC';
const FRAX_USDC_POOL = '0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2';
const TUSDFRAXBP_POOL = '0x33baeDa08b8afACc4d3d07cf31d49FC1F1f3E893';
const MultiSwapPathInitData = {
  routes: new Array(9).fill(ZERO_ADDRESS),
  routeParams: new Array(4).fill([0, 0, 0]) as any,
  swapType: 0, //NONE
  poolCount: 0,
  swapFrom: ZERO_ADDRESS,
  swapTo: ZERO_ADDRESS,
  inAmount: '0',
  outAmount: '0',
};

const getCollateralLevSwapper = async (testEnv: TestEnv, collateral: tEthereumAddress) => {
  const { levSwapManager, deployer } = testEnv;
  const levSwapAddress = await levSwapManager.getLevSwapper(collateral);
  return IGeneralLevSwap__factory.connect(levSwapAddress, deployer.signer);
};

const calcMinAmountOut = async (
  testEnv: TestEnv,
  fromIndex: number,
  toIndex: number,
  amount: BigNumberish,
  isDeposit: boolean,
  isCalcTokenAmount: boolean,
  isExchange: boolean,
  pool: tEthereumAddress
) => {
  const { deployer } = testEnv;

  const curvePool = ICurvePool__factory.connect(pool, deployer.signer);
  if (isCalcTokenAmount) {
    const amounts = new Array<BigNumberish>(2).fill('0');
    amounts[fromIndex] = amount;

    return await curvePool['calc_token_amount(uint256[2],bool)'](amounts as any, isDeposit);
  }

  if (isExchange) {
    return await curvePool.get_dy_underlying(fromIndex, toIndex, amount);
  }

  return await curvePool['calc_withdraw_one_coin(uint256,int128)'](amount, toIndex);
};

const calcFRAXUSDCPrice = async (testEnv: TestEnv) => {
  const { deployer, oracle, FRAX, usdc } = testEnv;
  const FRAXUSDCPool = ICurvePool__factory.connect(FRAX_USDC_POOL, deployer.signer);
  const FRAXUSDCLP = MintableERC20__factory.connect(FRAX_USDC_LP, deployer.signer);
  const fraxPrice = await oracle.getAssetPrice(FRAX.address);
  const fraxTotalBalance = await FRAXUSDCPool['balances(uint256)'](0);
  const usdcPrice = await oracle.getAssetPrice(usdc.address);
  const usdcTotalBalance = await FRAXUSDCPool['balances(uint256)'](1);
  const FRAXUSDCLpTotalSupply = await FRAXUSDCLP.totalSupply();

  return new BigNumber(fraxPrice.toString())
    .multipliedBy(fraxTotalBalance.toString())
    .dividedBy(1e18)
    .plus(
      new BigNumber(usdcPrice.toString()).multipliedBy(usdcTotalBalance.toString()).dividedBy(1e6)
    )
    .multipliedBy(1e18)
    .dividedBy(FRAXUSDCLpTotalSupply.toString());
};

const calcCollateralPrice = async (testEnv: TestEnv) => {
  const { deployer, oracle, TUSD, TUSD_FRAXBP_LP } = testEnv;
  const TUSDFRAXBPPool = ICurvePool__factory.connect(TUSDFRAXBP_POOL, deployer.signer);
  const tusdPrice = await oracle.getAssetPrice(TUSD.address);
  const tusdTotalBalance = await TUSDFRAXBPPool['balances(uint256)'](0);
  const FRAXUSDCPrice = await calcFRAXUSDCPrice(testEnv);
  const FRAXUSDCTotalBalance = await TUSDFRAXBPPool['balances(uint256)'](1);
  const lpTotalSupply = await TUSD_FRAXBP_LP.totalSupply();

  return new BigNumber(tusdPrice.toString())
    .multipliedBy(tusdTotalBalance.toString())
    .plus(new BigNumber(FRAXUSDCPrice.toString()).multipliedBy(FRAXUSDCTotalBalance.toString()))
    .dividedBy(lpTotalSupply.toString());
};

const calcInAmount = async (
  testEnv: TestEnv,
  amount: BigNumberish,
  leverage: BigNumberish,
  borrowingAsset: tEthereumAddress
) => {
  const { oracle } = testEnv;
  const collateralPrice = await calcCollateralPrice(testEnv);
  const borrowingAssetPrice = await oracle.getAssetPrice(borrowingAsset);

  const intputAmount = await convertToCurrencyDecimals(
    borrowingAsset,
    new BigNumber(amount.toString())
      .multipliedBy(leverage.toString())
      .div(10000)
      .multipliedBy(collateralPrice.toFixed(0))
      .div(borrowingAssetPrice.toString())
      .div(1 - 0.008) // flashloan fee + extra(swap loss) = 0.8%
      .toFixed(0)
  );

  return intputAmount;
};

const calcTotalBorrowAmount = async (
  testEnv: TestEnv,
  collateral: tEthereumAddress,
  amount: BigNumberish,
  ltv: BigNumberish,
  leverage: BigNumberish,
  borrowingAsset: tEthereumAddress
) => {
  const { oracle } = testEnv;
  const collateralPrice = await oracle.getAssetPrice(collateral);
  const borrowingAssetPrice = await oracle.getAssetPrice(borrowingAsset);

  const amountToBorrow = await convertToCurrencyDecimals(
    borrowingAsset,
    new BigNumber(amount.toString())
      .multipliedBy(leverage.toString())
      .div(10000)
      .plus(amount.toString())
      .multipliedBy(collateralPrice.toString())
      .multipliedBy(ltv.toString())
      .multipliedBy(1.5) // make enough amount
      .div(10000)
      .div(borrowingAssetPrice.toString())
      .toFixed(0)
  );

  return amountToBorrow;
};

const depositToLendingPool = async (
  token: MintableERC20,
  user: SignerWithAddress,
  amount: string,
  testEnv: TestEnv
) => {
  const { pool } = testEnv;
  // Approve
  await token.connect(user.signer).approve(pool.address, amount);
  // Deposit
  await pool.connect(user.signer).deposit(token.address, amount, user.address, '0');
};

makeSuite('USDC Structured Vault - Configuration', (testEnv) => {
  let vault: StableStructuredVault;

  before(async () => {
    // deploy USDC Structured Vault contract
    const { usdc, deployer } = testEnv;

    vault = await deployStableStructuredVault('USDC');

    await vault.setAdmin(deployer.address);
    await vault.initUnderlyingAsset(
      usdc.address,
      'Sturdy Structured USDC LP Token',
      'SS-USDC-LP',
      6
    );
  });

  it('check decimals, symbol, name, asset, shareIndex', async () => {
    const { usdc } = testEnv;

    expect(await vault.decimals()).to.be.eq(6);
    expect(await vault.symbol()).to.be.eq('SS-USDC-LP');
    expect(await vault.name()).to.be.eq('Sturdy Structured USDC LP Token');
    expect(await vault.getUnderlyingAsset()).to.be.eq(usdc.address);
    expect(await vault.getRate()).to.be.eq(parseEther('1'));
  });
});

makeSuite('USDC Structured Vault - User Deposit', (testEnv) => {
  let vault: StableStructuredVault;

  before(async () => {
    // deploy USDC Structured Vault contract
    const { usdc, deployer } = testEnv;

    vault = await deployStableStructuredVault('USDC');

    await vault.setAdmin(deployer.address);
    await vault.initUnderlyingAsset(
      usdc.address,
      'Sturdy Structured USDC LP Token',
      'SS-USDC-LP',
      6
    );
    await vault.setFee(1000); //10% performance fee
  });

  it('user deposit 1000 USDC to vault', async () => {
    const { usdc, users } = testEnv;
    const depositor = users[0];
    const depositAmount = (await convertToCurrencyDecimals(usdc.address, '1000')).toString();

    // Prepare Enough USDC for depositor
    await mint('USDC', depositAmount, depositor);

    // Approve vault
    await usdc.connect(depositor.signer).approve(vault.address, depositAmount);

    // Deposit
    await vault.deposit(depositor.address, depositAmount);

    expect(await vault.balanceOf(depositor.address)).to.be.eq(depositAmount);
    expect(await vault.totalSupply()).to.be.eq(depositAmount);
  });
});

makeSuite('USDC Structured Vault - ZapLeverage', (testEnv) => {
  let vault: StableStructuredVault;
  let tusdfraxbpLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    // deploy USDC Structured Vault contract
    const {
      usdc,
      deployer,
      cvxtusd_fraxbp,
      vaultWhitelist,
      convexTUSDFRAXBPVault,
      helpersContract,
      owner,
    } = testEnv;

    vault = await deployStableStructuredVault('USDC');

    await vault.setAdmin(deployer.address);
    await vault.initUnderlyingAsset(
      usdc.address,
      'Sturdy Structured USDC LP Token',
      'SS-USDC-LP',
      6
    );
    await vault.setFee(1000); //10% performance fee

    tusdfraxbpLevSwap = await getCollateralLevSwapper(testEnv, cvxtusd_fraxbp.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxtusd_fraxbp.address)
    ).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexTUSDFRAXBPVault.address, tusdfraxbpLevSwap.address);
  });

  it('user1: 1000, user2: 2000, user3: 3000 USDC deposit', async () => {
    const { usdc, users } = testEnv;
    const [user1, user2, user3] = users;
    const depositAmount = await convertToCurrencyDecimals(usdc.address, '1000');

    // Prepare Enough USDC for users
    await mint('USDC', depositAmount.toString(), user1);
    await mint('USDC', depositAmount.mul(2).toString(), user2);
    await mint('USDC', depositAmount.mul(3).toString(), user3);

    // Approve vault
    await usdc.connect(user1.signer).approve(vault.address, depositAmount);
    await usdc.connect(user2.signer).approve(vault.address, depositAmount.mul(2));
    await usdc.connect(user3.signer).approve(vault.address, depositAmount.mul(3));

    // Deposit
    await vault.deposit(user1.address, depositAmount);
    await vault.deposit(user2.address, depositAmount.mul(2));
    await vault.deposit(user3.address, depositAmount.mul(3));

    expect(await vault.balanceOf(user1.address)).to.be.eq(depositAmount);
    expect(await vault.balanceOf(user2.address)).to.be.eq(depositAmount.mul(2));
    expect(await vault.balanceOf(user3.address)).to.be.eq(depositAmount.mul(3));
    expect(await vault.totalSupply()).to.be.eq(depositAmount.mul(6));
    expect(await usdc.balanceOf(vault.address)).to.be.eq(depositAmount.mul(6));
  });

  it('admin zapLeverage 6000 USDC for TUSD_FRAXBP by borrowing USDC with leverage 4.5', async () => {
    const { usdc, TUSD_FRAXBP_LP, deployer } = testEnv;
    const zapLeverageAmount = (await convertToCurrencyDecimals(usdc.address, '6000')).toString();
    const leverage = 35000;

    // approving tokens for swapper
    await vault.authorizeSwapper(TUSD_FRAXBP_LP.address, tusdfraxbpLevSwap.address, true);
    await vault.authorizeSwapper(usdc.address, tusdfraxbpLevSwap.address, false);

    // Prepare ZapLeverage params
    const expectZapOutAmount1 = new BigNumber(
      (
        await calcMinAmountOut(testEnv, 1, 0, zapLeverageAmount, true, true, false, FRAX_USDC_POOL)
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectZapOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          expectZapOutAmount1.toFixed(0),
          true,
          true,
          false,
          TUSDFRAXBP_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const zapPaths = [
      {
        routes: [
          usdc.address,
          FRAX_USDC_POOL,
          FRAX_USDC_LP,
          TUSDFRAXBP_POOL,
          TUSD_FRAXBP_LP.address,
          ...new Array(4).fill(ZERO_ADDRESS),
        ],
        routeParams: [
          [1, 0, 7 /*2-coin-pool add_liquidity*/],
          [1, 0, 7 /*2-coin-pool add_liquidity*/],
          [0, 0, 0],
          [0, 0, 0],
        ] as any,
        swapType: 4, // curve
        poolCount: 2,
        swapFrom: usdc.address,
        swapTo: TUSD_FRAXBP_LP.address,
        inAmount: zapLeverageAmount,
        outAmount: expectZapOutAmount2.toFixed(0),
      },
      MultiSwapPathInitData,
      MultiSwapPathInitData,
    ] as any;
    const inAmount = (
      await calcInAmount(
        testEnv,
        await convertToCurrencyUnits(TUSD_FRAXBP_LP.address, expectZapOutAmount2.toFixed(0)),
        leverage,
        usdc.address
      )
    ).toString();
    const expectOutAmount1 = new BigNumber(
      (
        await calcMinAmountOut(testEnv, 1, 0, inAmount, true, true, false, FRAX_USDC_POOL)
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          expectOutAmount1.toFixed(0),
          true,
          true,
          false,
          TUSDFRAXBP_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const swapInfo = {
      paths: [
        {
          routes: [
            usdc.address,
            FRAX_USDC_POOL,
            FRAX_USDC_LP,
            TUSDFRAXBP_POOL,
            TUSD_FRAXBP_LP.address,
            ...new Array(4).fill(ZERO_ADDRESS),
          ],
          routeParams: [
            [1, 0, 7 /*2-coin-pool add_liquidity*/],
            [1, 0, 7 /*2-coin-pool add_liquidity*/],
            [0, 0, 0],
            [0, 0, 0],
          ] as any,
          swapType: 4, // curve
          poolCount: 2,
          swapFrom: usdc.address,
          swapTo: TUSD_FRAXBP_LP.address,
          inAmount,
          outAmount: expectOutAmount2.toFixed(0),
        },
        MultiSwapPathInitData,
        MultiSwapPathInitData,
      ] as any,
      reversePaths: [
        {
          routes: [
            TUSD_FRAXBP_LP.address,
            TUSDFRAXBP_POOL,
            FRAX_USDC_LP,
            FRAX_USDC_POOL,
            usdc.address,
            ...new Array(4).fill(ZERO_ADDRESS),
          ],
          routeParams: [
            [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
            [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
            [0, 0, 0],
            [0, 0, 0],
          ] as any,
          swapType: 4, //Curve
          poolCount: 2,
          swapFrom: TUSD_FRAXBP_LP.address,
          swapTo: usdc.address,
          inAmount: 0,
          outAmount: 0,
        },
        MultiSwapPathInitData,
        MultiSwapPathInitData,
      ] as any,
      pathLength: 1,
    };

    // Prepare USDC to Lending Pool
    const amountToDelegate = (
      await calcTotalBorrowAmount(
        testEnv,
        TUSD_FRAXBP_LP.address,
        await convertToCurrencyUnits(TUSD_FRAXBP_LP.address, expectZapOutAmount2.toFixed(0)),
        ltv,
        leverage,
        usdc.address
      )
    ).toString();
    // Depositor deposits USDT to Lending Pool
    await mint('USDC', amountToDelegate, deployer);
    await depositToLendingPool(usdc, deployer, amountToDelegate, testEnv);

    // run zapLeverage
    await vault.enterPosition(
      tusdfraxbpLevSwap.address,
      zapLeverageAmount,
      leverage,
      usdc.address,
      0,
      zapPaths,
      1,
      swapInfo
    );

    expect(await vault.totalSupply()).to.be.eq(zapLeverageAmount);
    expect(await usdc.balanceOf(vault.address)).to.be.eq(0);
  });
});
