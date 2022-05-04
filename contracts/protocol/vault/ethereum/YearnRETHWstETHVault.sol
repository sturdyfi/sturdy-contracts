// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {GeneralVault} from '../GeneralVault.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IYearnVault} from '../../../interfaces/IYearnVault.sol';
import {ICurvePool} from '../../../interfaces/ICurvePool.sol';
import {IWstETH} from '../../../interfaces/IWstETH.sol';
import {IWETH} from '../../../misc/interfaces/IWETH.sol';
import {ISwapRouter} from '../../../interfaces/ISwapRouter.sol';
import {TransferHelper} from '../../libraries/helpers/TransferHelper.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {SafeMath} from '../../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';
import {CurveswapAdapter} from '../../libraries/swap/CurveswapAdapter.sol';

/**
 * @title YearnRETHWstETHVault
 * @notice yvCurve-rETHwstETH/rETHwstETH-f Vault by using Yearn on Fantom
 * @author Sturdy
 **/
contract YearnRETHWstETHVault is GeneralVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  // // uniswap pool fee to 0.05%.
  // uint24 constant uniswapFee = 500;

  /**
   * @dev Receive Ether
   */
  receive() external payable {}

  function processYield() external override onlyAdmin {
    // Get yield from lendingPool
    address YVRETH_WSTETH = _addressesProvider.getAddress('YVRETH_WSTETH');
    uint256 yieldYVRETH_WSTETH = _getYield(YVRETH_WSTETH);

    // move yield to treasury
    if (_vaultFee > 0) {
      uint256 treasuryYVRETH_WSTETH = _processTreasury(yieldYVRETH_WSTETH);
      yieldYVRETH_WSTETH = yieldYVRETH_WSTETH.sub(treasuryYVRETH_WSTETH);
    }

    // Withdraw from Yearn Vault and receive rETHwstETH-f
    uint256 yieldRETH_WSTETH = IYearnVault(YVRETH_WSTETH).withdraw(
      yieldYVRETH_WSTETH,
      address(this),
      1
    );

    // Withdraw rETHwstETH-f from curve finance pool and receive wstETH
    uint256 yieldWstETH = _withdrawLiquidityPool(
      _addressesProvider.getAddress('RETH_WSTETH'),
      yieldRETH_WSTETH
    );

    // Unwrap wstETH and receive stETH
    uint256 yieldStETH = IWstETH(_addressesProvider.getAddress('WSTETH')).unwrap(yieldWstETH);

    // Exchange stETH -> ETH via Curve
    uint256 receivedETHAmount = CurveswapAdapter.swapExactTokensForTokens(
      _addressesProvider,
      _addressesProvider.getAddress('STETH_ETH_POOL'),
      _addressesProvider.getAddress('LIDO'),
      ETH,
      yieldStETH,
      200
    );

    // ETH -> WETH
    address weth = _addressesProvider.getAddress('WETH');
    IWETH(weth).deposit{value: receivedETHAmount}();

    // transfer WETH to yieldManager
    address yieldManager = _addressesProvider.getAddress('YIELD_MANAGER');
    TransferHelper.safeTransfer(weth, yieldManager, receivedETHAmount);

    // AssetYield[] memory assetYields = _getAssetYields(receivedETHAmount);
    // for (uint256 i = 0; i < assetYields.length; i++) {
    //   // WETH -> Asset and Deposit to pool
    //   if (assetYields[i].amount > 0) {
    //     _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount, true);
    //   }
    // }

    emit ProcessYield(_addressesProvider.getAddress('RETH_WSTETH'), yieldRETH_WSTETH);
  }

  function withdrawOnLiquidation(address _asset, uint256 _amount)
    external
    override
    returns (uint256)
  {
    address RETH_WSTETH = _addressesProvider.getAddress('RETH_WSTETH');

    require(_asset == RETH_WSTETH, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == _addressesProvider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    // Withdraw from Yearn Vault and receive RETH_WSTETH
    uint256 assetAmount = IYearnVault(_addressesProvider.getAddress('YVRETH_WSTETH')).withdraw(
      _amount,
      address(this),
      1
    );

    // Deliver RETH_WSTETH to user
    TransferHelper.safeTransfer(RETH_WSTETH, msg.sender, assetAmount);

    return assetAmount;
  }

  function _withdrawLiquidityPool(address _poolAddress, uint256 _amount)
    internal
    returns (uint256 amountWstETH)
  {
    uint256 minWstETHAmount = ICurvePool(_poolAddress).calc_withdraw_one_coin(_amount, 1, false);
    amountWstETH = ICurvePool(_poolAddress).remove_liquidity_one_coin(
      _amount,
      1,
      minWstETHAmount,
      address(this)
    );
  }

  // function _convertAssetByCurve(address _fromAsset, uint256 _fromAmount)
  //   internal
  //   returns (uint256)
  // {
  //   // Exchange stETH -> ETH via curve
  //   address CurveswapLidoPool = _addressesProvider.getAddress('STETH_ETH_POOL');
  //   IERC20(_fromAsset).safeApprove(CurveswapLidoPool, _fromAmount);
  //   uint256 minAmount = ICurvePool(CurveswapLidoPool).get_dy(1, 0, _fromAmount);

  //   // Calculate minAmount from price with 1% slippage
  //   IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
  //   uint256 assetPrice = oracle.getAssetPrice(_fromAsset);
  //   uint256 minAmountFromPrice = _fromAmount.percentMul(99_00).mul(assetPrice).div(10**18);

  //   if (minAmountFromPrice < minAmount) minAmount = minAmountFromPrice;

  //   uint256 receivedAmount = ICurvePool(CurveswapLidoPool).exchange(1, 0, _fromAmount, minAmount);
  //   return receivedAmount;
  // }

  // function _convertAndDepositYield(
  //   address _tokenOut,
  //   uint256 _wethAmount,
  //   bool _isDeposit
  // ) internal {
  //   // Approve the uniswapRouter to spend WETH.
  //   address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');
  //   address WETH = _addressesProvider.getAddress('WETH');
  //   TransferHelper.safeApprove(WETH, uniswapRouter, _wethAmount);

  //   // Calculate minAmount from price with 1% slippage
  //   uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
  //   IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
  //   uint256 assetPrice = oracle.getAssetPrice(_tokenOut);
  //   uint256 minAmountFromPrice = _wethAmount.div(assetPrice).percentMul(99_00).mul(
  //     10**assetDecimal
  //   );

  //   // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
  //   // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
  //   ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
  //     tokenIn: WETH,
  //     tokenOut: _tokenOut,
  //     fee: uniswapFee,
  //     recipient: address(this),
  //     deadline: block.timestamp,
  //     amountIn: _wethAmount,
  //     amountOutMinimum: minAmountFromPrice,
  //     sqrtPriceLimitX96: 0
  //   });

  //   // Exchange WETH -> _tokenOut via UniswapV3
  //   uint256 receivedAmount = ISwapRouter(uniswapRouter).exactInputSingle(params);
  //   require(receivedAmount > 0, Errors.VT_PROCESS_YIELD_INVALID);
  //   require(
  //     IERC20(_tokenOut).balanceOf(address(this)) >= receivedAmount,
  //     Errors.VT_PROCESS_YIELD_INVALID
  //   );

  //   if (_isDeposit) {
  //     // Make lendingPool to transfer required amount
  //     IERC20(_tokenOut).safeApprove(address(_addressesProvider.getLendingPool()), receivedAmount);
  //     // Deposit Yield to pool
  //     _depositYield(_tokenOut, receivedAmount);
  //   } else {
  //     TransferHelper.safeTransfer(_tokenOut, msg.sender, receivedAmount);
  //   }
  // }

  // function convertOnLiquidation(address _assetOut, uint256 _amountIn) external override {
  //   require(
  //     msg.sender == _addressesProvider.getAddress('LIQUIDATOR'),
  //     Errors.LP_LIQUIDATION_CONVERT_FAILED
  //   );

  //   // Withdraw rETHwstETH-f from curve finance pool and receive wstETH
  //   uint256 wstETHAmount = _withdrawLiquidityPool(
  //     _addressesProvider.getAddress('RETH_WSTETH'),
  //     _amountIn
  //   );

  //   // Unwrap wstETH and receive stETH
  //   uint256 stETHAmount = IWstETH(_addressesProvider.getAddress('WSTETH')).unwrap(wstETHAmount);

  //   // Exchange stETH -> ETH via Curve
  //   uint256 receivedETHAmount = _convertAssetByCurve(
  //     _addressesProvider.getAddress('LIDO'),
  //     stETHAmount
  //   );
  //   // ETH -> WETH
  //   address weth = _addressesProvider.getAddress('WETH');
  //   IWETH(weth).deposit{value: receivedETHAmount}();

  //   TransferHelper.safeTransfer(weth, msg.sender, receivedETHAmount);
  // }

  /**
   * @dev Get yield amount based on strategy
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(_addressesProvider.getAddress('YVRETH_WSTETH'));
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    return IYearnVault(_addressesProvider.getAddress('YVRETH_WSTETH')).pricePerShare();
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive YVRETH_WSTETH
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    address YVRETH_WSTETH = _addressesProvider.getAddress('YVRETH_WSTETH');
    address RETH_WSTETH = _addressesProvider.getAddress('RETH_WSTETH');

    // receive RETH_WSTETH from user
    require(_asset == RETH_WSTETH, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    TransferHelper.safeTransferFrom(RETH_WSTETH, msg.sender, address(this), _amount);

    // Deposit RETH_WSTETH to Yearn Vault and receive YVRETH_WSTETH
    IERC20(RETH_WSTETH).approve(YVRETH_WSTETH, _amount);
    uint256 assetAmount = IYearnVault(YVRETH_WSTETH).deposit(_amount, address(this));

    // Make lendingPool to transfer required amount
    IERC20(YVRETH_WSTETH).approve(address(_addressesProvider.getLendingPool()), assetAmount);
    return (YVRETH_WSTETH, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of YVRETH_WSTETH based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (_addressesProvider.getAddress('YVRETH_WSTETH'), _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with YVRETH_WSTETH and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override returns (uint256) {
    address YVRETH_WSTETH = _addressesProvider.getAddress('YVRETH_WSTETH');
    address RETH_WSTETH = _addressesProvider.getAddress('RETH_WSTETH');

    require(_asset == RETH_WSTETH, Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    // Withdraw from Yearn Vault and receive RETH_WSTETH
    uint256 assetAmount = IYearnVault(YVRETH_WSTETH).withdraw(_amount, address(this), 1);

    // Deliver RETH_WSTETH to user
    TransferHelper.safeTransfer(RETH_WSTETH, _to, assetAmount);
    return assetAmount;
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('YVRETH_WSTETH')).safeTransfer(
      _treasuryAddress,
      treasuryAmount
    );
    return treasuryAmount;
  }
}
