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
import { getVariableDebtToken } from '../../helpers/contracts-getters';
import { advanceBlock, timeLatest } from '../../helpers/misc-utils';

const chai = require('chai');
const { expect } = chai;

const CONVEX_YIELD_PERIOD = 100000;
const slippage = 0.0002; //0.02%
const treasuryAddress = '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a';
const FRAX_USDC_LP = '0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC';
const FRAX_USDC_POOL = '0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2';
const TUSDFRAXBP_POOL = '0x33baeDa08b8afACc4d3d07cf31d49FC1F1f3E893';
const THREE_CRV_LP = '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490';
const THREE_CRV_POOL = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7';
const FRAX3CRV_POOL = '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B';
const SUSD_POOL = '0xA5407eAE9Ba41422680e2e00537571bcC53efBfD';
const SUSD = '0x57Ab1ec28D129707052df4dF418D58a2D46d5f51';
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
  poolCoinsLength: number,
  isDeposit: boolean,
  isCalcTokenAmount: boolean,
  isExchange: boolean,
  pool: tEthereumAddress
) => {
  const { deployer } = testEnv;

  const curvePool = ICurvePool__factory.connect(pool, deployer.signer);
  if (isCalcTokenAmount) {
    const amounts = new Array<BigNumberish>(poolCoinsLength).fill('0');
    amounts[fromIndex] = amount;

    if (poolCoinsLength == 2)
      return await curvePool['calc_token_amount(uint256[2],bool)'](amounts as any, isDeposit);
    if (poolCoinsLength == 3)
      return await curvePool['calc_token_amount(uint256[3],bool)'](amounts as any, isDeposit);
    return await curvePool['calc_token_amount(uint256[4],bool)'](amounts as any, isDeposit);
  }

  if (isExchange) {
    return await curvePool.get_dy_underlying(fromIndex, toIndex, amount);
  }

  return await curvePool['calc_withdraw_one_coin(uint256,int128)'](amount, toIndex);
};

const calcDefaultMinAmountOut = async (
  testEnv: TestEnv,
  amount: BigNumberish,
  fromAsset: tEthereumAddress,
  toAsset: tEthereumAddress,
  slippage: number
) => {
  const { oracle } = testEnv;
  const fromAssetPrice = await oracle.getAssetPrice(fromAsset);
  const toAssetPrice = await oracle.getAssetPrice(toAsset);

  return await convertToCurrencyDecimals(
    toAsset,
    new BigNumber(await convertToCurrencyUnits(fromAsset, amount.toString()))
      .multipliedBy(fromAssetPrice.toString())
      .dividedBy(toAssetPrice.toString())
      .multipliedBy(1 - slippage) // swap loss
      .toFixed(0)
  );
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

const calcTUSDFRAXBPCollateralPrice = async (testEnv: TestEnv) => {
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

const calcSUSDCollateralPrice = async (testEnv: TestEnv) => {
  const { deployer, oracle, dai, usdc, usdt, DAI_USDC_USDT_SUSD_LP } = testEnv;

  const curvePool = ICurvePool__factory.connect(SUSD_POOL, deployer.signer);
  const daiPrice = await oracle.getAssetPrice(dai.address);
  const daiTotalBalance = await curvePool['balances(int128)'](0);
  const usdcPrice = await oracle.getAssetPrice(usdc.address);
  const usdcTotalBalance = await curvePool['balances(int128)'](1);
  const usdtPrice = await oracle.getAssetPrice(usdt.address);
  const usdtTotalBalance = await curvePool['balances(int128)'](2);
  const susdPrice = await oracle.getAssetPrice(SUSD);
  const susdTotalBalance = await curvePool['balances(int128)'](3);
  const lpTotalSupply = await DAI_USDC_USDT_SUSD_LP.totalSupply();

  return new BigNumber(daiPrice.toString())
    .multipliedBy(daiTotalBalance.toString())
    .dividedBy(1e18)
    .plus(
      new BigNumber(usdcPrice.toString()).multipliedBy(usdcTotalBalance.toString()).dividedBy(1e6)
    )
    .plus(
      new BigNumber(usdtPrice.toString()).multipliedBy(usdtTotalBalance.toString()).dividedBy(1e6)
    )
    .plus(
      new BigNumber(susdPrice.toString()).multipliedBy(susdTotalBalance.toString()).dividedBy(1e18)
    )
    .multipliedBy(1e18)
    .dividedBy(lpTotalSupply.toString());
};

const calcInAmount = async (
  symbol: string,
  testEnv: TestEnv,
  amount: BigNumberish,
  leverage: BigNumberish,
  borrowingAsset: tEthereumAddress
) => {
  const { oracle } = testEnv;
  const collateralPrice =
    symbol === 'TUSD_FRAXBP_LP'
      ? await calcTUSDFRAXBPCollateralPrice(testEnv)
      : await calcSUSDCollateralPrice(testEnv);
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
    await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee
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
    await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee

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
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          zapLeverageAmount,
          2,
          true,
          true,
          false,
          FRAX_USDC_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectZapOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          expectZapOutAmount1.toFixed(0),
          2,
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
        'TUSD_FRAXBP_LP',
        testEnv,
        await convertToCurrencyUnits(TUSD_FRAXBP_LP.address, expectZapOutAmount2.toFixed(0)),
        leverage,
        usdc.address
      )
    ).toString();
    const expectOutAmount1 = new BigNumber(
      (
        await calcMinAmountOut(testEnv, 1, 0, inAmount, 2, true, true, false, FRAX_USDC_POOL)
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          expectOutAmount1.toFixed(0),
          2,
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

makeSuite('USDC Structured Vault - Leverage', (testEnv) => {
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
    await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee

    tusdfraxbpLevSwap = await getCollateralLevSwapper(testEnv, cvxtusd_fraxbp.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxtusd_fraxbp.address)
    ).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexTUSDFRAXBPVault.address, tusdfraxbpLevSwap.address);
  });

  it('admin leverage 5000 TUSD_FRAXBP by borrowing USDC with leverage 4.5', async () => {
    const { usdc, TUSD_FRAXBP_LP, deployer } = testEnv;
    const leverageAmount = (
      await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, '5000')
    ).toString();
    const leverage = 35000;

    // approving tokens for swapper
    await vault.authorizeSwapper(TUSD_FRAXBP_LP.address, tusdfraxbpLevSwap.address, true);
    await vault.authorizeSwapper(usdc.address, tusdfraxbpLevSwap.address, false);

    // Prepare Collateral
    await mint('TUSD_FRAXBP_LP', leverageAmount, deployer);
    await TUSD_FRAXBP_LP.transfer(vault.address, leverageAmount);

    // Prepare Leverage params
    const inAmount = (
      await calcInAmount(
        'TUSD_FRAXBP_LP',
        testEnv,
        await convertToCurrencyUnits(TUSD_FRAXBP_LP.address, leverageAmount),
        leverage,
        usdc.address
      )
    ).toString();
    const expectOutAmount1 = new BigNumber(
      (
        await calcMinAmountOut(testEnv, 1, 0, inAmount, 2, true, true, false, FRAX_USDC_POOL)
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          expectOutAmount1.toFixed(0),
          2,
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
        await convertToCurrencyUnits(TUSD_FRAXBP_LP.address, leverageAmount),
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
      leverageAmount,
      leverage,
      usdc.address,
      0,
      [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData],
      0,
      swapInfo
    );

    expect(await TUSD_FRAXBP_LP.balanceOf(vault.address)).to.be.eq(0);
  });
});

makeSuite('USDC Structured Vault - Deleverage (1)', (testEnv) => {
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
    await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee

    tusdfraxbpLevSwap = await getCollateralLevSwapper(testEnv, cvxtusd_fraxbp.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxtusd_fraxbp.address)
    ).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexTUSDFRAXBPVault.address, tusdfraxbpLevSwap.address);
  });

  it('admin leverage 5000 TUSD_FRAXBP by borrowing USDC with leverage 4.5', async () => {
    const { usdc, TUSD_FRAXBP_LP, deployer } = testEnv;
    const leverageAmount = (
      await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, '5000')
    ).toString();
    const leverage = 35000;

    // approving tokens for swapper
    await vault.authorizeSwapper(TUSD_FRAXBP_LP.address, tusdfraxbpLevSwap.address, true);
    await vault.authorizeSwapper(usdc.address, tusdfraxbpLevSwap.address, false);

    // Prepare Collateral
    await mint('TUSD_FRAXBP_LP', leverageAmount, deployer);
    await TUSD_FRAXBP_LP.transfer(vault.address, leverageAmount);

    // Prepare Leverage params
    const inAmount = (
      await calcInAmount(
        'TUSD_FRAXBP_LP',
        testEnv,
        await convertToCurrencyUnits(TUSD_FRAXBP_LP.address, leverageAmount),
        leverage,
        usdc.address
      )
    ).toString();
    const expectOutAmount1 = new BigNumber(
      (
        await calcMinAmountOut(testEnv, 1, 0, inAmount, 2, true, true, false, FRAX_USDC_POOL)
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          expectOutAmount1.toFixed(0),
          2,
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
        await convertToCurrencyUnits(TUSD_FRAXBP_LP.address, leverageAmount),
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
      leverageAmount,
      leverage,
      usdc.address,
      0,
      [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData],
      0,
      swapInfo
    );

    expect(await TUSD_FRAXBP_LP.balanceOf(vault.address)).to.be.eq(0);
  });

  it('admin Deleverage 99% TUSD_FRAXBP', async () => {
    const { usdc, TUSD_FRAXBP_LP, deployer, helpersContract, aCVXTUSD_FRAXBP } = testEnv;
    const deleverageAmount = (await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, '5000'))
      .mul(99)
      .div(100)
      .toString();

    // Prepare Deleverage params
    const reverseExpectOutAmount1 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          0,
          1,
          deleverageAmount,
          2,
          false,
          false,
          false,
          TUSDFRAXBP_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const reverseExpectOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          0,
          1,
          reverseExpectOutAmount1.toFixed(0),
          2,
          false,
          false,
          false,
          FRAX_USDC_POOL
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
          inAmount: 0,
          outAmount: 0,
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
          inAmount: deleverageAmount,
          outAmount: reverseExpectOutAmount2.toFixed(0),
        },
        MultiSwapPathInitData,
        MultiSwapPathInitData,
      ] as any,
      pathLength: 1,
    };

    const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
      .variableDebtTokenAddress;
    const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
    const repayAmount = await varDebtToken.balanceOf(vault.address);

    // run zapLeverage
    await vault.exitPosition(
      tusdfraxbpLevSwap.address,
      repayAmount,
      deleverageAmount,
      usdc.address,
      aCVXTUSD_FRAXBP.address,
      0,
      swapInfo
    );

    expect(await TUSD_FRAXBP_LP.balanceOf(vault.address)).to.be.eq(deleverageAmount);
  });
});

makeSuite('USDC Structured Vault - Deleverage (2)', (testEnv) => {
  let vault: StableStructuredVault;
  let daiusdcusdtsusdLevSwap = {} as IGeneralLevSwap;
  let ltv = '';

  before(async () => {
    // deploy USDC Structured Vault contract
    const {
      usdc,
      deployer,
      cvxdai_usdc_usdt_susd,
      vaultWhitelist,
      convexDAIUSDCUSDTSUSDVault,
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
    await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee

    daiusdcusdtsusdLevSwap = await getCollateralLevSwapper(testEnv, cvxdai_usdc_usdt_susd.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxdai_usdc_usdt_susd.address)
    ).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(
        convexDAIUSDCUSDTSUSDVault.address,
        daiusdcusdtsusdLevSwap.address
      );
  });

  it('admin leverage 5000 DAI_USDC_USDT_SUSD by borrowing USDC with leverage 4.5', async () => {
    const { usdc, DAI_USDC_USDT_SUSD_LP, deployer } = testEnv;
    const leverageAmount = (
      await convertToCurrencyDecimals(DAI_USDC_USDT_SUSD_LP.address, '5000')
    ).toString();
    const leverage = 35000;

    // approving tokens for swapper
    await vault.authorizeSwapper(
      DAI_USDC_USDT_SUSD_LP.address,
      daiusdcusdtsusdLevSwap.address,
      true
    );
    await vault.authorizeSwapper(usdc.address, daiusdcusdtsusdLevSwap.address, false);

    // Prepare Collateral
    await mint('DAI_USDC_USDT_SUSD_LP', leverageAmount, deployer);
    await DAI_USDC_USDT_SUSD_LP.transfer(vault.address, leverageAmount);

    // Prepare Leverage params
    const inAmount = (
      await calcInAmount(
        'DAI_USDC_USDT_SUSD_LP',
        testEnv,
        await convertToCurrencyUnits(DAI_USDC_USDT_SUSD_LP.address, leverageAmount),
        leverage,
        usdc.address
      )
    ).toString();
    const expectOutAmount = new BigNumber(
      (await calcMinAmountOut(testEnv, 1, 0, inAmount, 4, true, true, false, SUSD_POOL)).toString()
    ).multipliedBy(1 - slippage);
    const swapInfo = {
      paths: [
        {
          routes: [
            usdc.address,
            SUSD_POOL,
            DAI_USDC_USDT_SUSD_LP.address,
            ...new Array(6).fill(ZERO_ADDRESS),
          ],
          routeParams: [
            [1, 0, 10 /*4-coin-pool add_liquidity*/],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ] as any,
          swapType: 4, // curve
          poolCount: 1,
          swapFrom: usdc.address,
          swapTo: DAI_USDC_USDT_SUSD_LP.address,
          inAmount,
          outAmount: expectOutAmount.toFixed(0),
        },
        MultiSwapPathInitData,
        MultiSwapPathInitData,
      ] as any,
      reversePaths: [
        {
          routes: new Array(9).fill(ZERO_ADDRESS),
          routeParams: new Array(4).fill([0, 0, 0]) as any,
          swapType: 1, //NO_SWAP: Join/Exit pool
          poolCount: 0,
          swapFrom: DAI_USDC_USDT_SUSD_LP.address,
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
        DAI_USDC_USDT_SUSD_LP.address,
        await convertToCurrencyUnits(DAI_USDC_USDT_SUSD_LP.address, leverageAmount),
        ltv,
        leverage,
        usdc.address
      )
    ).toString();

    // Depositor deposits USDT to Lending Pool
    await mint('USDC', amountToDelegate, deployer);
    await depositToLendingPool(usdc, deployer, amountToDelegate, testEnv);

    // run Leverage
    await vault.enterPosition(
      daiusdcusdtsusdLevSwap.address,
      leverageAmount,
      leverage,
      usdc.address,
      0,
      [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData],
      0,
      swapInfo
    );

    expect(await DAI_USDC_USDT_SUSD_LP.balanceOf(vault.address)).to.be.eq(0);
  });

  it('admin Deleverage 99% DAI_USDC_USDT_SUSD', async () => {
    const { usdc, DAI_USDC_USDT_SUSD_LP, helpersContract, aCVXDAI_USDC_USDT_SUSD } = testEnv;
    const deleverageAmount = (
      await convertToCurrencyDecimals(DAI_USDC_USDT_SUSD_LP.address, '5000')
    )
      .mul(99)
      .div(100)
      .toString();

    // Prepare Deleverage params
    const swapInfo = {
      paths: [
        {
          routes: [
            usdc.address,
            SUSD_POOL,
            DAI_USDC_USDT_SUSD_LP.address,
            ...new Array(6).fill(ZERO_ADDRESS),
          ],
          routeParams: [
            [1, 0, 10 /*4-coin-pool add_liquidity*/],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ] as any,
          swapType: 4, // curve
          poolCount: 1,
          swapFrom: usdc.address,
          swapTo: DAI_USDC_USDT_SUSD_LP.address,
          inAmount: 0,
          outAmount: 0,
        },
        MultiSwapPathInitData,
        MultiSwapPathInitData,
      ] as any,
      reversePaths: [
        {
          routes: new Array(9).fill(ZERO_ADDRESS),
          routeParams: new Array(4).fill([0, 0, 0]) as any,
          swapType: 1, //NO_SWAP: Join/Exit pool
          poolCount: 0,
          swapFrom: DAI_USDC_USDT_SUSD_LP.address,
          swapTo: usdc.address,
          inAmount: 0,
          outAmount: 0,
        },
        MultiSwapPathInitData,
        MultiSwapPathInitData,
      ] as any,
      pathLength: 1,
    };

    const usdcDebtTokenAddress = (await helpersContract.getReserveTokensAddresses(usdc.address))
      .variableDebtTokenAddress;
    const varDebtToken = await getVariableDebtToken(usdcDebtTokenAddress);
    const repayAmount = await varDebtToken.balanceOf(vault.address);
    const outAmount = new BigNumber(repayAmount.toString())
      .multipliedBy(1.0005) // aave v3 flashloan fee 0.05%
      .plus(0.5)
      .dp(0, 1) //round down with decimal 0
      .toFixed(0);
    const expectInAmount = new BigNumber(
      (
        await calcMinAmountOut(testEnv, 1, 0, outAmount, 4, false, true, false, SUSD_POOL)
      ).toString()
    );
    swapInfo.reversePaths[0].inAmount = expectInAmount.multipliedBy(1 + slippage).toFixed(0);
    swapInfo.reversePaths[0].outAmount = outAmount;

    // run zapLeverage
    await vault.exitPosition(
      daiusdcusdtsusdLevSwap.address,
      repayAmount,
      deleverageAmount,
      usdc.address,
      aCVXDAI_USDC_USDT_SUSD.address,
      0,
      swapInfo
    );

    expect(await DAI_USDC_USDT_SUSD_LP.balanceOf(vault.address)).to.be.eq(deleverageAmount);
  });
});

makeSuite('USDC Structured Vault - Migration to USDC', (testEnv) => {
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
    await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee

    tusdfraxbpLevSwap = await getCollateralLevSwapper(testEnv, cvxtusd_fraxbp.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxtusd_fraxbp.address)
    ).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexTUSDFRAXBPVault.address, tusdfraxbpLevSwap.address);
  });

  it('admin migration 5000 TUSD_FRAXBP to USDC', async () => {
    const { usdc, TUSD_FRAXBP_LP, deployer } = testEnv;
    const migrationAmount = (
      await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, '5000')
    ).toString();

    // approving tokens for swapper

    // Prepare Collateral
    await mint('TUSD_FRAXBP_LP', migrationAmount, deployer);
    await TUSD_FRAXBP_LP.transfer(vault.address, migrationAmount);

    // Prepare Migration params
    const expectOutAmount1 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          0,
          1,
          migrationAmount,
          2,
          false,
          false,
          false,
          TUSDFRAXBP_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          0,
          1,
          expectOutAmount1.toFixed(0),
          2,
          false,
          false,
          false,
          FRAX_USDC_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const paths = [
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
        inAmount: migrationAmount,
        outAmount: expectOutAmount2.toFixed(0),
      },
    ] as any;

    // run zapLeverage
    await vault.migration(migrationAmount, paths);

    expect(await TUSD_FRAXBP_LP.balanceOf(vault.address)).to.be.eq(0);
    expect(await usdc.balanceOf(vault.address)).to.be.gt(
      await convertToCurrencyDecimals(usdc.address, (5000 * 0.99).toString())
    );
  });
});

makeSuite('USDC Structured Vault - Migration to Collateral(1)', (testEnv) => {
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
    await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee

    tusdfraxbpLevSwap = await getCollateralLevSwapper(testEnv, cvxtusd_fraxbp.address);
    ltv = (
      await helpersContract.getReserveConfigurationData(cvxtusd_fraxbp.address)
    ).ltv.toString();

    await vaultWhitelist
      .connect(owner.signer)
      .addAddressToWhitelistContract(convexTUSDFRAXBPVault.address, tusdfraxbpLevSwap.address);
  });

  it('admin migration 5000 TUSD_FRAXBP to FRAX_3CRV', async () => {
    const { usdc, TUSD_FRAXBP_LP, deployer, FRAX_3CRV_LP } = testEnv;
    const migrationAmount = (
      await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, '5000')
    ).toString();

    // Prepare Collateral
    await mint('TUSD_FRAXBP_LP', migrationAmount, deployer);
    await TUSD_FRAXBP_LP.transfer(vault.address, migrationAmount);

    // Prepare Migration params
    const expectOutAmount1 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          0,
          1,
          migrationAmount,
          2,
          false,
          false,
          false,
          TUSDFRAXBP_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          0,
          1,
          expectOutAmount1.toFixed(0),
          2,
          false,
          false,
          false,
          FRAX_USDC_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectOutAmount3 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          expectOutAmount2.toFixed(0),
          3,
          true,
          true,
          false,
          THREE_CRV_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectOutAmount4 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          expectOutAmount3.toFixed(0),
          2,
          true,
          true,
          false,
          FRAX3CRV_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const paths = [
      {
        routes: [
          TUSD_FRAXBP_LP.address,
          TUSDFRAXBP_POOL,
          FRAX_USDC_LP,
          FRAX_USDC_POOL,
          usdc.address,
          THREE_CRV_POOL,
          THREE_CRV_LP,
          FRAX3CRV_POOL,
          FRAX_3CRV_LP.address,
        ],
        routeParams: [
          [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
          [0, 1, 12 /*2-coin-pool remove_liquidity_one_coin*/],
          [1, 0, 8 /*3-coin-pool add_liquidity*/],
          [1, 0, 7 /*2-coin-pool add_liquidity*/],
        ] as any,
        swapType: 4, //Curve
        poolCount: 4,
        swapFrom: TUSD_FRAXBP_LP.address,
        swapTo: FRAX_3CRV_LP.address,
        inAmount: migrationAmount,
        outAmount: expectOutAmount4.toFixed(0),
      },
    ] as any;

    // run zapLeverage
    await vault.migration(migrationAmount, paths);

    expect(await TUSD_FRAXBP_LP.balanceOf(vault.address)).to.be.eq(0);
    expect(await FRAX_3CRV_LP.balanceOf(vault.address)).to.be.gt(
      await convertToCurrencyDecimals(FRAX_3CRV_LP.address, '4900')
    );
  });
});

makeSuite('USDC Structured Vault - ZapLeverage and Yield Distribute', (testEnv) => {
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
    await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee

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
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          zapLeverageAmount,
          2,
          true,
          true,
          false,
          FRAX_USDC_POOL
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectZapOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          expectZapOutAmount1.toFixed(0),
          2,
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
        'TUSD_FRAXBP_LP',
        testEnv,
        await convertToCurrencyUnits(TUSD_FRAXBP_LP.address, expectZapOutAmount2.toFixed(0)),
        leverage,
        usdc.address
      )
    ).toString();
    const expectOutAmount1 = new BigNumber(
      (
        await calcMinAmountOut(testEnv, 1, 0, inAmount, 2, true, true, false, FRAX_USDC_POOL)
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectOutAmount2 = new BigNumber(
      (
        await calcMinAmountOut(
          testEnv,
          1,
          0,
          expectOutAmount1.toFixed(0),
          2,
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

  it('admin claim Yield and distribute', async () => {
    const {
      usdc,
      CRV,
      WETH,
      convexTUSDFRAXBPVault,
      variableYieldDistributor,
      aCVXTUSD_FRAXBP,
      users,
    } = testEnv;
    const [user1, user2, user3] = users;
    const depositAmount = await convertToCurrencyDecimals(usdc.address, '1000');
    const treasuryUSDCAmountBefore = await usdc.balanceOf(treasuryAddress);

    // fetch available rewards before
    const rewardsBalanceBefore = await variableYieldDistributor.getRewardsBalance(
      [aCVXTUSD_FRAXBP.address],
      vault.address
    );
    expect(rewardsBalanceBefore[0].balance).to.be.eq(0);

    // make Yield
    await advanceBlock((await timeLatest()).plus(CONVEX_YIELD_PERIOD).toNumber());
    await convexTUSDFRAXBPVault.processYield();

    // fetch available rewards after
    const rewardsBalance = await variableYieldDistributor.getRewardsBalance(
      [aCVXTUSD_FRAXBP.address],
      vault.address
    );
    expect(rewardsBalance[0].balance).to.be.gt(0);
    expect(await vault.balanceOf(user1.address)).to.be.eq(depositAmount);
    expect(await vault.balanceOf(user2.address)).to.be.eq(depositAmount.mul(2));
    expect(await vault.balanceOf(user3.address)).to.be.eq(depositAmount.mul(3));
    expect(await vault.totalSupply()).to.be.eq(depositAmount.mul(6));
    expect(await usdc.balanceOf(vault.address)).to.be.eq(0);

    // Prepare Migration params
    const expectOutAmount1 = new BigNumber(
      (
        await calcDefaultMinAmountOut(
          testEnv,
          rewardsBalance[0].balance,
          CRV.address,
          WETH.address,
          0.01 // 1%
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const expectOutAmount2 = new BigNumber(
      (
        await calcDefaultMinAmountOut(
          testEnv,
          expectOutAmount1.toFixed(0),
          WETH.address,
          usdc.address,
          0.005 //0.5%
        )
      ).toString()
    ).multipliedBy(1 - slippage);
    const params = [
      {
        yieldAsset: CRV.address,
        paths: [
          {
            routes: [
              CRV.address,
              ZERO_ADDRESS,
              WETH.address,
              ZERO_ADDRESS,
              usdc.address,
              ...new Array(4).fill(ZERO_ADDRESS),
            ],
            routeParams: [
              [10000 /* uniswap pool fee 1% */, 0, 0],
              [500 /* uniswap pool fee 0.05% */, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ] as any,
            swapType: 2, //Uniswap
            poolCount: 2,
            swapFrom: CRV.address,
            swapTo: usdc.address,
            inAmount: rewardsBalance[0].balance,
            outAmount: expectOutAmount2.toFixed(0),
          },
        ] as any,
      },
    ];

    // run claimYield and distribute
    await vault.processYield([aCVXTUSD_FRAXBP.address], [rewardsBalance[0].balance], params);

    const treasuryUSDCAmount = await usdc.balanceOf(treasuryAddress);
    expect(treasuryUSDCAmount.sub(treasuryUSDCAmountBefore)).to.be.gt(0);
    expect(await usdc.balanceOf(vault.address)).to.be.gt(0);

    const increasedYieldUSDC = await usdc.balanceOf(vault.address);
    expect(await vault.balanceOf(user1.address)).to.be.gte(
      depositAmount.add(increasedYieldUSDC.div(6)).sub(1)
    );
    expect(await vault.balanceOf(user2.address)).to.be.gte(
      depositAmount.mul(2).add(increasedYieldUSDC.div(6).mul(2)).sub(1)
    );
    expect(await vault.balanceOf(user3.address)).to.be.gte(
      depositAmount.mul(3).add(increasedYieldUSDC.div(6).mul(3)).sub(1)
    );
    expect(await vault.totalSupply()).to.be.gte(
      depositAmount.mul(6).add(increasedYieldUSDC).sub(1)
    );
  });
});

makeSuite('USDC Structured Vault - Withdraw', (testEnv) => {
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
    await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee

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

  it('user1 withdraw 2000 USDC failed, user4 withdraw user1`s 1000 USDC failed, user2 withdraw 2000 USDC success', async () => {
    const { usdc, users, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP } = testEnv;
    const [user1, user2, , user4] = users;
    const withdrawAmount = await convertToCurrencyDecimals(usdc.address, '1000');

    // Prepare withdraw params
    const params = {
      swapper: ZERO_ADDRESS,
      borrowAsset: ZERO_ADDRESS,
      sAsset: ZERO_ADDRESS,
      flashLoanType: 0,
      swapInfo: {
        paths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
        reversePaths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
        pathLength: 0,
      },
      paths: [],
    };
    await expect(vault.connect(user1.signer).withdraw(user1.address, withdrawAmount.mul(2), params))
      .to.be.reverted;
    await expect(vault.connect(user4.signer).withdraw(user1.address, withdrawAmount, params)).to.be
      .reverted;
    await expect(vault.connect(user2.signer).withdraw(user2.address, withdrawAmount.mul(2), params))
      .to.not.be.reverted;

    expect(await vault.totalSupply()).to.be.eq(withdrawAmount.mul(4));
    expect(await usdc.balanceOf(vault.address)).to.be.eq(withdrawAmount.mul(4));
    expect(await usdc.balanceOf(user2.address)).to.be.eq(withdrawAmount.mul(2));
  });
});

makeSuite(
  'USDC Structured Vault - Withdraw via deleverage and migration but vault has some USDC',
  (testEnv) => {
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
      await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee
      await vault.setSwapLoss(50); //0.5%

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
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            zapLeverageAmount,
            2,
            true,
            true,
            false,
            FRAX_USDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectZapOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            expectZapOutAmount1.toFixed(0),
            2,
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
          'TUSD_FRAXBP_LP',
          testEnv,
          await convertToCurrencyUnits(TUSD_FRAXBP_LP.address, expectZapOutAmount2.toFixed(0)),
          leverage,
          usdc.address
        )
      ).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 1, 0, inAmount, 2, true, true, false, FRAX_USDC_POOL)
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            expectOutAmount1.toFixed(0),
            2,
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

    it('user1 withdraw 1000 USDC via auto deleverage and migration but vault has some USDC', async () => {
      const { usdc, users, aCVXTUSD_FRAXBP, TUSD_FRAXBP_LP, deployer } = testEnv;
      const [user1] = users;
      const withdrawAmount = await convertToCurrencyDecimals(usdc.address, '1000');

      // Prepare 500 USDC for vault
      await mint('USDC', withdrawAmount.div(2).toString(), deployer);
      await usdc.transfer(vault.address, withdrawAmount.div(2));

      // Prepare deleverage params
      const deleverageAmount = new BigNumber(
        (await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, '600')).mul(99).div(100).toString()
      ).toFixed(0);
      const reverseExpectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            deleverageAmount,
            2,
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const reverseExpectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount1.toFixed(0),
            2,
            false,
            false,
            false,
            FRAX_USDC_POOL
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
            inAmount: 0,
            outAmount: 0,
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
            inAmount: deleverageAmount,
            outAmount: reverseExpectOutAmount2.toFixed(0),
          },
          MultiSwapPathInitData,
          MultiSwapPathInitData,
        ] as any,
        pathLength: 1,
      };

      // Prepare Migration params
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            reverseExpectOutAmount2.toFixed(0),
            2,
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            expectOutAmount1.toFixed(0),
            2,
            false,
            false,
            false,
            FRAX_USDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const paths = [
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
          inAmount: deleverageAmount,
          outAmount: expectOutAmount2.toFixed(0),
        },
      ] as any;

      // Prepare Withdraw Params
      const params = {
        swapper: tusdfraxbpLevSwap.address,
        borrowAsset: usdc.address,
        sAsset: aCVXTUSD_FRAXBP.address,
        flashLoanType: 0,
        swapInfo,
        paths,
      };

      expect(await usdc.balanceOf(vault.address)).to.be.eq(withdrawAmount.div(2));
      expect(await usdc.balanceOf(user1.address)).to.be.eq(0);
      expect(await vault.balanceOf(user1.address)).to.be.eq(withdrawAmount);
      expect(await vault.totalSupply()).to.be.eq(withdrawAmount.mul(6));

      // Withdraw
      await vault.connect(user1.signer).withdraw(user1.address, withdrawAmount, params);

      expect(await usdc.balanceOf(vault.address)).to.be.lte(withdrawAmount.div(8));
      expect(await usdc.balanceOf(user1.address)).to.be.eq(withdrawAmount);
      expect(await vault.balanceOf(user1.address)).to.be.eq(0);
      expect(await vault.totalSupply()).to.be.eq(withdrawAmount.mul(5));
    });
  }
);

makeSuite(
  'USDC Structured Vault - Withdraw via only migration since vault has enough collateral',
  (testEnv) => {
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
      await vault.setTreasuryInfo(treasuryAddress, 1000); //10% performance fee
      await vault.setSwapLoss(50); //0.5%

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
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            zapLeverageAmount,
            2,
            true,
            true,
            false,
            FRAX_USDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectZapOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            expectZapOutAmount1.toFixed(0),
            2,
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
          'TUSD_FRAXBP_LP',
          testEnv,
          await convertToCurrencyUnits(TUSD_FRAXBP_LP.address, expectZapOutAmount2.toFixed(0)),
          leverage,
          usdc.address
        )
      ).toString();
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(testEnv, 1, 0, inAmount, 2, true, true, false, FRAX_USDC_POOL)
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            1,
            0,
            expectOutAmount1.toFixed(0),
            2,
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

    it('user1 withdraw 1000 USDC via auto only migration since vault has enough collateral', async () => {
      const { usdc, users, TUSD_FRAXBP_LP, deployer } = testEnv;
      const [user1] = users;
      const withdrawAmount = await convertToCurrencyDecimals(usdc.address, '1000');
      const deleverageAmount = await convertToCurrencyDecimals(TUSD_FRAXBP_LP.address, '600');

      // Prepare Collateral for vault
      await mint('TUSD_FRAXBP_LP', deleverageAmount.toString(), deployer);
      await TUSD_FRAXBP_LP.transfer(vault.address, deleverageAmount);

      // Prepare 500 USDC for vault
      await mint('USDC', withdrawAmount.div(2).toString(), deployer);
      await usdc.transfer(vault.address, withdrawAmount.div(2));

      // Prepare Migration params
      const expectOutAmount1 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            deleverageAmount.div(6).mul(5).toString(),
            2,
            false,
            false,
            false,
            TUSDFRAXBP_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const expectOutAmount2 = new BigNumber(
        (
          await calcMinAmountOut(
            testEnv,
            0,
            1,
            expectOutAmount1.toFixed(0),
            2,
            false,
            false,
            false,
            FRAX_USDC_POOL
          )
        ).toString()
      ).multipliedBy(1 - slippage);
      const paths = [
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
          inAmount: deleverageAmount.div(6).mul(5).toString(),
          outAmount: expectOutAmount2.toFixed(0),
        },
      ] as any;

      // Prepare Withdraw Params
      const params = {
        swapper: tusdfraxbpLevSwap.address,
        borrowAsset: ZERO_ADDRESS,
        sAsset: ZERO_ADDRESS,
        flashLoanType: 0,
        swapInfo: {
          paths: [MultiSwapPathInitData, MultiSwapPathInitData, MultiSwapPathInitData] as any,
          reversePaths: [
            MultiSwapPathInitData,
            MultiSwapPathInitData,
            MultiSwapPathInitData,
          ] as any,
          pathLength: 0,
        },
        paths,
      };

      expect(await TUSD_FRAXBP_LP.balanceOf(vault.address)).to.be.eq(deleverageAmount);
      expect(await usdc.balanceOf(vault.address)).to.be.eq(withdrawAmount.div(2));
      expect(await usdc.balanceOf(user1.address)).to.be.eq(0);
      expect(await vault.balanceOf(user1.address)).to.be.eq(withdrawAmount);
      expect(await vault.totalSupply()).to.be.eq(withdrawAmount.mul(6));

      // Withdraw
      await vault.connect(user1.signer).withdraw(user1.address, withdrawAmount, params);

      expect(await TUSD_FRAXBP_LP.balanceOf(vault.address)).to.be.lte(deleverageAmount.div(4));
      expect(await usdc.balanceOf(vault.address)).to.be.lte(withdrawAmount.div(4));
      expect(await usdc.balanceOf(user1.address)).to.be.eq(withdrawAmount);
      expect(await vault.balanceOf(user1.address)).to.be.eq(0);
      expect(await vault.totalSupply()).to.be.eq(withdrawAmount.mul(5));
    });
  }
);
