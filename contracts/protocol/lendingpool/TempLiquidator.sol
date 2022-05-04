// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {IFlashLoanReceiver} from '../../flashloan/interfaces/IFlashLoanReceiver.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {IAaveFlashLoan} from '../../interfaces/IAaveFlashLoan.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {IERC20Detailed} from '../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IWETH} from '../../misc/interfaces/IWETH.sol';
import {IPriceOracleGetter} from '../../interfaces/IPriceOracleGetter.sol';
import {IUniswapV2Router02} from '../../interfaces/IUniswapV2Router02.sol';
import {IFBeetsToken} from '../../interfaces/IFBeetsToken.sol';
import {IBalancerWeightedPool} from '../../interfaces/IBalancerWeightedPool.sol';
import {IYearnFBEETSVault} from '../../interfaces/IYearnFBEETSVault.sol';
import {ICollateralAdapter} from '../../interfaces/ICollateralAdapter.sol';
import {IBalancerVault} from '../../interfaces/IBalancerVault.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import {IGeneralVault} from '../../interfaces/IGeneralVault.sol';
import {TransferHelper} from '../libraries/helpers/TransferHelper.sol';

/**
 * @title TempLiquidator
 * @notice TempLiquidator
 * @author Sturdy
 **/

contract TempLiquidator is IFlashLoanReceiver, Ownable {
  using SafeMath for uint256;
  using PercentageMath for uint256;

  ILendingPoolAddressesProvider internal _addressesProvider;

  /**
   * @dev Receive FTM
   */
  receive() external payable {}

  /**
   * @dev Function is invoked by the proxy contract when the Adapter contract is deployed.
   * @param _provider The address of the provider
   **/
  constructor(ILendingPoolAddressesProvider _provider) public {
    _addressesProvider = _provider;
  }

  function withdraw(address asset) external onlyOwner {
    uint256 amount = IERC20(asset).balanceOf(address(this));
    IERC20(asset).transfer(msg.sender, amount);
  }

  /**
   * This function is called after your contract has received the flash loaned amount
   * overriding executeOperation() in IFlashLoanReceiver
   */
  function executeOperation(
    address[] calldata assets,
    uint256[] calldata amounts,
    uint256[] calldata premiums,
    address initiator,
    bytes calldata params
  ) external override returns (bool) {
    // parse params
    (address collateralAddress, address borrowerAddress) = abi.decode(params, (address, address));

    // call liquidation
    IERC20(assets[0]).approve(_addressesProvider.getLendingPool(), amounts[0]);
    ILendingPool(_addressesProvider.getLendingPool()).liquidationCall(
      collateralAddress,
      assets[0],
      borrowerAddress,
      amounts[0],
      false
    );

    _convertCollateral(collateralAddress, assets[0]);

    // Approve the LendingPool contract allowance to *pull* the owed amount
    uint256 amountOwing = amounts[0].add(premiums[0]);
    IERC20(assets[0]).approve(_addressesProvider.getAddress('AAVE_LENDING_POOL'), amountOwing);

    return true;
  }

  function liquidation(
    address debtAsset,
    uint256 debtToCover,
    bytes calldata params
  ) external {
    IAaveFlashLoan AAVE_LENDING_POOL = IAaveFlashLoan(
      _addressesProvider.getAddress('AAVE_LENDING_POOL')
    );

    address[] memory assets = new address[](1);
    assets[0] = debtAsset;

    uint256[] memory amounts = new uint256[](1);
    amounts[0] = debtToCover;

    // 0 means revert the transaction if not validated
    uint256[] memory modes = new uint256[](1);
    modes[0] = 0;

    AAVE_LENDING_POOL.flashLoan(address(this), assets, amounts, modes, address(this), params, 0);
  }

  /**
   * Swap from collateralAsset to debtAsset
   */
  function _convertCollateral(address collateralAsset, address asset) internal {
    uint256 collateralAmount = IERC20(collateralAsset).balanceOf(address(this));

    if (collateralAsset == _addressesProvider.getAddress('WFTM')) {
      _convertWFTM(collateralAsset, asset, collateralAmount);
    } else if (collateralAsset == _addressesProvider.getAddress('BOO')) {
      _convertBOO(collateralAsset, asset, collateralAmount);
    } else if (collateralAsset == _addressesProvider.getAddress('fBEETS')) {
      _convertFBEETS(collateralAsset, asset, collateralAmount);
    } else if (collateralAsset == _addressesProvider.getAddress('LINK')) {
      _convertLINK(collateralAsset, asset, collateralAmount);
    } else if (collateralAsset == _addressesProvider.getAddress('SPELL')) {
      _convertSPELL(collateralAsset, asset, collateralAmount);
    } else if (collateralAsset == _addressesProvider.getAddress('CRV')) {
      _convertCRV(collateralAsset, asset, collateralAmount);
    } else {
      ICollateralAdapter collateralAdapter = ICollateralAdapter(
        _addressesProvider.getAddress('COLLATERAL_ADAPTER')
      );
      address vault = collateralAdapter.getAcceptableVault(collateralAsset);
      require(vault != address(0), Errors.LP_LIQUIDATION_CONVERT_FAILED);

      // send collateral asset to vault
      TransferHelper.safeTransfer(collateralAsset, vault, collateralAmount);

      // convert collateral asset and receive swappable asset
      IGeneralVault(vault).convertOnLiquidation(collateralAmount);

      // convert swappable asset to debt asset
    }
  }

  function _convertWFTM(
    address collateralAsset,
    address asset,
    uint256 collateralAmount
  ) internal {
    // WFTM -> FTM
    IWETH(collateralAsset).withdraw(collateralAmount);

    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');

    // Calculate minAmount from price with 1% slippage
    uint256 assetDecimal = IERC20Detailed(asset).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 minAmountFromPrice = collateralAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('YVWFTM')))
      .div(10**18)
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(asset))
      .percentMul(99_00);

    // Exchange FTM -> Asset via UniswapV2
    address[] memory path = new address[](2);
    path[0] = address(collateralAsset);
    path[1] = asset;

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactETHForTokens{
      value: collateralAmount
    }(minAmountFromPrice, path, address(this), block.timestamp);
    require(receivedAmounts[1] > 0, Errors.LP_LIQUIDATION_CONVERT_FAILED);
    require(
      IERC20(asset).balanceOf(address(this)) >= receivedAmounts[1],
      Errors.LP_LIQUIDATION_CONVERT_FAILED
    );
  }

  function _convertBOO(
    address collateralAsset,
    address asset,
    uint256 collateralAmount
  ) internal {
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');

    // Calculate minAmount from price with 2% slippage
    uint256 assetDecimal = IERC20Detailed(asset).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 minAmountFromPrice = collateralAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('YVBOO')))
      .div(10**18)
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(asset))
      .percentMul(98_00);

    // Exchange BOO -> Asset via UniswapV2
    address[] memory path = new address[](3);
    path[0] = collateralAsset;
    path[1] = _addressesProvider.getAddress('WFTM');
    path[2] = asset;

    IERC20(collateralAsset).approve(uniswapRouter, collateralAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      collateralAmount,
      minAmountFromPrice,
      path,
      address(this),
      block.timestamp
    );
    require(receivedAmounts[2] > 0, Errors.LP_LIQUIDATION_CONVERT_FAILED);
    require(
      IERC20(asset).balanceOf(address(this)) >= receivedAmounts[2],
      Errors.LP_LIQUIDATION_CONVERT_FAILED
    );
  }

  function _convertSPELL(
    address collateralAsset,
    address asset,
    uint256 collateralAmount
  ) internal {
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');

    // Calculate minAmount from price with 2% slippage
    uint256 assetDecimal = IERC20Detailed(asset).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 minAmountFromPrice = collateralAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('YVSPELL')))
      .div(10**18)
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(asset))
      .percentMul(98_00);

    // Exchange SPELL -> Asset via UniswapV2
    address[] memory path = new address[](3);
    path[0] = collateralAsset;
    path[1] = _addressesProvider.getAddress('WFTM');
    path[2] = asset;

    IERC20(collateralAsset).approve(uniswapRouter, collateralAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      collateralAmount,
      minAmountFromPrice,
      path,
      address(this),
      block.timestamp
    );
    require(receivedAmounts[2] > 0, Errors.LP_LIQUIDATION_CONVERT_FAILED);
    require(
      IERC20(asset).balanceOf(address(this)) >= receivedAmounts[2],
      Errors.LP_LIQUIDATION_CONVERT_FAILED
    );
  }

  function _convertCRV(
    address collateralAsset,
    address asset,
    uint256 collateralAmount
  ) internal {
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');

    // Calculate minAmount from price with 2% slippage
    uint256 assetDecimal = IERC20Detailed(asset).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 minAmountFromPrice = collateralAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('YVCRV')))
      .div(10**18)
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(asset))
      .percentMul(98_00);

    // Exchange CRV -> Asset via UniswapV2
    address[] memory path = new address[](3);
    path[0] = collateralAsset;
    path[1] = _addressesProvider.getAddress('WFTM');
    path[2] = asset;

    IERC20(collateralAsset).approve(uniswapRouter, collateralAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      collateralAmount,
      minAmountFromPrice,
      path,
      address(this),
      block.timestamp
    );
    require(receivedAmounts[2] > 0, Errors.LP_LIQUIDATION_CONVERT_FAILED);
    require(
      IERC20(asset).balanceOf(address(this)) >= receivedAmounts[2],
      Errors.LP_LIQUIDATION_CONVERT_FAILED
    );
  }

  function _withdrawLiquidityPool(uint256 fbeetsAmount, address collateralAsset)
    internal
    returns (uint256 amountBEETS, uint256 amountWFTM)
  {
    // burn fBEETS token
    ICollateralAdapter collateralAdapter = ICollateralAdapter(
      _addressesProvider.getAddress('COLLATERAL_ADAPTER')
    );
    address fBEETS = _addressesProvider.getAddress('fBEETS');
    address BEETS_FTM_Pool = IFBeetsToken(fBEETS).vestingToken();
    address fBEETSVault = collateralAdapter.getAcceptableVault(collateralAsset);
    bytes32 beethoven_BEETS_FTM_PoolId = IYearnFBEETSVault(fBEETSVault)
      .beethoven_BEETS_FTM_PoolId();
    require(
      IBalancerWeightedPool(BEETS_FTM_Pool).getPoolId() == beethoven_BEETS_FTM_PoolId,
      Errors.VT_PROCESS_YIELD_INVALID
    );

    uint256 beforeOfBalance = IERC20(BEETS_FTM_Pool).balanceOf(address(this));
    IFBeetsToken(fBEETS).leave(fbeetsAmount);
    uint256 afterOfBalance = IERC20(BEETS_FTM_Pool).balanceOf(address(this));
    uint256 _amount = afterOfBalance.sub(beforeOfBalance);

    // Withdraw from LP
    // ToDo: calculate minimum amount from token balance
    // https://dev.balancer.fi/resources/joins-and-exits/pool-exits
    uint256 _totalAmount = IERC20(BEETS_FTM_Pool).totalSupply();
    (address[] memory tokens, uint256[] memory balances, ) = IBalancerVault(
      IYearnFBEETSVault(fBEETSVault).getBeethovenVault()
    ).getPoolTokens(beethoven_BEETS_FTM_PoolId);
    require(tokens.length == balances.length, Errors.VT_PROCESS_YIELD_INVALID);

    uint256[] memory amountsOut = new uint256[](tokens.length);
    for (uint256 i = 0; i < tokens.length; i++) {
      amountsOut[i] = balances[i].mul(_amount).div(_totalAmount).percentMul(99_00);
    }

    IBalancerVault(IYearnFBEETSVault(fBEETSVault).getBeethovenVault()).exitPool(
      beethoven_BEETS_FTM_PoolId,
      address(this),
      payable(address(this)),
      IBalancerVault.ExitPoolRequest({
        assets: tokens,
        minAmountsOut: amountsOut,
        userData: abi.encode(IBalancerWeightedPool.ExitKind.EXACT_BPT_IN_FOR_TOKENS_OUT, _amount),
        toInternalBalance: false
      })
    );
  }

  function _calcSwapMinAmount(uint256 beetsAmount, address collateralAsset)
    internal
    returns (uint256)
  {
    uint256 assetDecimal = IERC20Detailed(_addressesProvider.getAddress('WFTM')).decimals();
    ICollateralAdapter collateralAdapter = ICollateralAdapter(
      _addressesProvider.getAddress('COLLATERAL_ADAPTER')
    );
    address fBEETSVault = collateralAdapter.getAcceptableVault(collateralAsset);

    // Calculate minAmount from price with 2% slippage
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 minAmountFromPrice = beetsAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('BEETS')))
      .div(10**18);
    minAmountFromPrice = minAmountFromPrice
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(_addressesProvider.getAddress('YVWFTM')))
      .percentMul(98_00);

    // Substract pool's swap fee
    (address swapPool, ) = IBalancerVault(IYearnFBEETSVault(fBEETSVault).getBeethovenVault())
      .getPool(IYearnFBEETSVault(fBEETSVault).beethovenSwapPoolId());
    uint256 swapFee = IBalancerWeightedPool(swapPool).getSwapFeePercentage();

    return minAmountFromPrice.mul(10**18 - swapFee).div(10**18);
  }

  function _swapBEETS2WFTM(uint256 beetsAmount, address collateralAsset)
    internal
    returns (uint256)
  {
    IBalancerVault.SingleSwap memory singleSwap;
    IBalancerVault.FundManagement memory funds;
    ICollateralAdapter collateralAdapter = ICollateralAdapter(
      _addressesProvider.getAddress('COLLATERAL_ADAPTER')
    );
    address fBEETSVault = collateralAdapter.getAcceptableVault(collateralAsset);
    bytes32 beethovenSwapPoolId = IYearnFBEETSVault(fBEETSVault).beethovenSwapPoolId();

    address BEETS = _addressesProvider.getAddress('BEETS');
    address WFTM = _addressesProvider.getAddress('WFTM');

    uint256 limit = _calcSwapMinAmount(beetsAmount, collateralAsset);
    // ToDo: Need to consider batchSwap, but, it's impossible now to implement Smart Order Router on-chain
    // Single Swap using The Fidelio Duetto Pool
    singleSwap.poolId = beethovenSwapPoolId;
    singleSwap.kind = IBalancerVault.SwapKind.GIVEN_IN;
    singleSwap.assetIn = BEETS;
    singleSwap.assetOut = WFTM;
    singleSwap.amount = beetsAmount;

    funds.sender = address(this);
    funds.recipient = payable(address(this));
    funds.fromInternalBalance = false;
    funds.toInternalBalance = false;

    IERC20(BEETS).approve(IYearnFBEETSVault(fBEETSVault).getBeethovenVault(), beetsAmount);

    uint256 receivedAmount = IBalancerVault(IYearnFBEETSVault(fBEETSVault).getBeethovenVault())
      .swap(singleSwap, funds, limit, uint256(-1));
    require(receivedAmount > 0, Errors.VT_PROCESS_YIELD_INVALID);

    return receivedAmount;
  }

  function _convertFBEETS(
    address collateralAsset,
    address asset,
    uint256 collateralAmount
  ) internal {
    address BEETS = _addressesProvider.getAddress('BEETS');
    address WFTM = _addressesProvider.getAddress('WFTM');

    uint256 _balanceOfBEETS = IERC20(BEETS).balanceOf(address(this));
    uint256 _balanceOfWFTM = IERC20(WFTM).balanceOf(address(this));

    // fBEETS -> (BEETS, WFTM)
    _withdrawLiquidityPool(collateralAmount, collateralAsset);

    // BEETS -> WFTM
    uint256 balance = IERC20(BEETS).balanceOf(address(this));
    uint256 beetsAmount = balance.sub(_balanceOfBEETS);
    require(beetsAmount > 0, Errors.LP_LIQUIDATION_CONVERT_FAILED);
    _swapBEETS2WFTM(beetsAmount, collateralAsset);

    balance = IERC20(WFTM).balanceOf(address(this));
    uint256 wftmAmount = balance.sub(_balanceOfWFTM);
    _convertWFTM(WFTM, asset, wftmAmount);
  }

  function _convertLINK(
    address collateralAsset,
    address asset,
    uint256 collateralAmount
  ) internal {
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');

    // Calculate minAmount from price with 2% slippage
    uint256 assetDecimal = IERC20Detailed(asset).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 minAmountFromPrice = collateralAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('YVLINK')))
      .div(10**18)
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(asset))
      .percentMul(98_00);

    // Exchange LINK -> Asset via UniswapV2
    address[] memory path = new address[](3);
    path[0] = collateralAsset;
    path[1] = _addressesProvider.getAddress('WFTM');
    path[2] = asset;

    IERC20(collateralAsset).approve(uniswapRouter, collateralAmount);

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
      collateralAmount,
      minAmountFromPrice,
      path,
      address(this),
      block.timestamp
    );
    require(receivedAmounts[2] > 0, Errors.LP_LIQUIDATION_CONVERT_FAILED);
    require(
      IERC20(asset).balanceOf(address(this)) >= receivedAmounts[2],
      Errors.LP_LIQUIDATION_CONVERT_FAILED
    );
  }
}
