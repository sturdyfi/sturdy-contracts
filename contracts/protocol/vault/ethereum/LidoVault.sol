// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {GeneralVault} from '../GeneralVault.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IWETH} from '../../../misc/interfaces/IWETH.sol';
import {ICurveSwap} from '../../../interfaces/ICurveSwap.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {ISwapRouter} from '../../../interfaces/ISwapRouter.sol';
import {TransferHelper} from '../../libraries/helpers/TransferHelper.sol';
import {SafeMath} from '../../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';

/**
 * @title LidoVault
 * @notice stETH/ETH Vault by using Lido, Uniswap, Curve
 * @author Sturdy
 **/
contract LidoVault is GeneralVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  // uniswap pool fee to 0.05%.
  uint24 constant uniswapFee = 500;

  /**
   * @dev Receive Ether
   */
  receive() external payable {}

  /**
   * @dev Grab excess stETH which was from rebasing on Lido
   *  And convert stETH -> ETH -> asset, deposit to pool
   */
  function processYield() external override onlyAdmin {
    // Get yield from lendingPool
    address LIDO = _addressesProvider.getAddress('LIDO');
    uint256 yieldStETH = _getYield(LIDO);

    // move yield to treasury
    if (_vaultFee > 0) {
      uint256 treasuryStETH = _processTreasury(yieldStETH);
      yieldStETH = yieldStETH.sub(treasuryStETH);
    }

    // Exchange stETH -> ETH via Curve
    uint256 receivedETHAmount = _convertAssetByCurve(LIDO, yieldStETH);
    // ETH -> WETH
    IWETH(_addressesProvider.getAddress('WETH')).deposit{value: receivedETHAmount}();

    AssetYield[] memory assetYields = _getAssetYields(receivedETHAmount);
    for (uint256 i = 0; i < assetYields.length; i++) {
      // WETH -> Asset and Deposit to pool
      if (assetYields[i].amount > 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount, true);
      }
    }

    emit ProcessYield(_addressesProvider.getAddress('WETH'), receivedETHAmount);
  }

  function _convertAndDepositYield(
    address _tokenOut,
    uint256 _wethAmount,
    bool _isDeposit
  ) internal {
    // Approve the uniswapRouter to spend WETH.
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');
    address WETH = _addressesProvider.getAddress('WETH');
    TransferHelper.safeApprove(WETH, uniswapRouter, _wethAmount);

    // Calculate minAmount from price with 1% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 assetPrice = oracle.getAssetPrice(_tokenOut);
    uint256 minAmountFromPrice = _wethAmount.div(assetPrice).percentMul(99_00).mul(
      10**assetDecimal
    );

    // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
    // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
    ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
      tokenIn: WETH,
      tokenOut: _tokenOut,
      fee: uniswapFee,
      recipient: address(this),
      deadline: block.timestamp,
      amountIn: _wethAmount,
      amountOutMinimum: minAmountFromPrice,
      sqrtPriceLimitX96: 0
    });

    // Exchange WETH -> _tokenOut via UniswapV3
    uint256 receivedAmount = ISwapRouter(uniswapRouter).exactInputSingle(params);
    require(receivedAmount > 0, Errors.VT_PROCESS_YIELD_INVALID);
    require(
      IERC20(_tokenOut).balanceOf(address(this)) >= receivedAmount,
      Errors.VT_PROCESS_YIELD_INVALID
    );

    if (_isDeposit) {
      // Make lendingPool to transfer required amount
      IERC20(_tokenOut).safeApprove(address(_addressesProvider.getLendingPool()), receivedAmount);
      // Deposit Yield to pool
      _depositYield(_tokenOut, receivedAmount);
    } else {
      TransferHelper.safeTransfer(_tokenOut, msg.sender, receivedAmount);
    }
  }

  function convertOnLiquidation(address _assetOut, uint256 _amountIn) external override {
    require(
      msg.sender == _addressesProvider.getAddress('Liquidator'),
      Errors.LP_LIQUIDATION_CONVERT_FAILED
    );

    // Exchange stETH -> ETH via Curve
    uint256 receivedETHAmount = _convertAssetByCurve(
      _addressesProvider.getAddress('LIDO'),
      _amountIn
    );
    // ETH -> WETH
    IWETH(_addressesProvider.getAddress('WETH')).deposit{value: receivedETHAmount}();

    // WETH -> Asset
    _convertAndDepositYield(_assetOut, receivedETHAmount, false);
  }

  /**
   * @dev Get yield amount based on strategy
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(_addressesProvider.getAddress('LIDO'));
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive stAsset
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    address LIDO = _addressesProvider.getAddress('LIDO');
    uint256 assetAmount = _amount;
    if (_asset == address(0)) {
      // Case of ETH deposit from user, user has to send ETH
      require(msg.value > 0, Errors.VT_COLLATERAL_DEPOSIT_REQUIRE_ETH);

      // Deposit ETH to Lido and receive stETH
      (bool sent, bytes memory data) = LIDO.call{value: msg.value}('');
      require(sent, Errors.VT_COLLATERAL_DEPOSIT_INVALID);

      assetAmount = msg.value;
    } else {
      // Case of stETH deposit from user, receive stETH from user
      require(_asset == LIDO, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
      IERC20(LIDO).safeTransferFrom(msg.sender, address(this), _amount);
    }

    // Make lendingPool to transfer required amount
    IERC20(LIDO).safeApprove(address(_addressesProvider.getLendingPool()), assetAmount);
    return (LIDO, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of stAsset based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (_addressesProvider.getAddress('LIDO'), _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with stAsset and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override {
    address LIDO = _addressesProvider.getAddress('LIDO');
    if (_asset == address(0)) {
      // Case of ETH withdraw request from user, so exchange stETH -> ETH via curve
      uint256 receivedETHAmount = _convertAssetByCurve(LIDO, _amount);
      // send ETH to user
      (bool sent, bytes memory data) = address(_to).call{value: receivedETHAmount}('');
      require(sent, Errors.VT_COLLATERAL_WITHDRAW_INVALID);
    } else {
      // Case of stETH withdraw request from user, so directly send
      require(_asset == LIDO, Errors.VT_COLLATERAL_WITHDRAW_INVALID);
      IERC20(LIDO).safeTransfer(_to, _amount);
    }
  }

  /**
   * @dev convert asset via curve
   */
  function _convertAssetByCurve(address _fromAsset, uint256 _fromAmount) private returns (uint256) {
    // Exchange stETH -> ETH via curve
    address CurveswapLidoPool = _addressesProvider.getAddress('CurveswapLidoPool');
    IERC20(_fromAsset).safeApprove(CurveswapLidoPool, _fromAmount);
    uint256 minAmount = ICurveSwap(CurveswapLidoPool).get_dy(1, 0, _fromAmount);

    // Calculate minAmount from price with 1% slippage
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 assetPrice = oracle.getAssetPrice(_fromAsset);
    uint256 minAmountFromPrice = _fromAmount.percentMul(99_00).mul(assetPrice).div(10**18);

    if (minAmountFromPrice < minAmount) minAmount = minAmountFromPrice;

    uint256 receivedAmount = ICurveSwap(CurveswapLidoPool).exchange(1, 0, _fromAmount, minAmount);
    return receivedAmount;
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('LIDO')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
