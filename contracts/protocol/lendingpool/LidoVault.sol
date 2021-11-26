// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';
import {GeneralVault} from './GeneralVault.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IWETH} from '../../misc/interfaces/IWETH.sol';
import {ICurveSwap} from '../../interfaces/ICurveSwap.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {ISwapRouter} from '../../interfaces/ISwapRouter.sol';
import {TransferHelper} from '../libraries/helpers/TransferHelper.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';

/**
 * @title LidoVault
 * @notice stETH/ETH Vault by using Lido, Uniswap, Curve
 * @author Sturdy
 **/

contract LidoVault is GeneralVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  //ToDo: need to think about using registering flow instead of constant value
  address constant LIDO = 0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F;
  address constant CurveswapLidoPool = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022;
  address constant UniswapRouter = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
  address constant WETH = 0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6;

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
    uint256 yieldStETH = _getYield(LIDO);

    // move yield to treasury
    if (_vaultFee > 0) {
      uint256 treasuryStETH = _processTreasury(yieldStETH);
      yieldStETH = yieldStETH.sub(treasuryStETH);
    }

    // Exchange stETH -> ETH via Curve
    uint256 receivedETHAmount = _convertAssetByCurve(LIDO, yieldStETH);
    // ETH -> WETH
    IWETH(WETH).deposit{value: receivedETHAmount}();

    AssetYield[] memory assetYields = _getAssetYields(receivedETHAmount);
    for (uint256 i = 0; i < assetYields.length; i++) {
      // WETH -> Asset and Deposit to pool
      if (assetYields[i].amount > 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }
  }

  function _convertAndDepositYield(address _tokenOut, uint256 _wethAmount) internal {
    // Approve the uniswapRouter to spend WETH.
    TransferHelper.safeApprove(WETH, UniswapRouter, _wethAmount);

    // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
    // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
    ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
      tokenIn: WETH,
      tokenOut: _tokenOut,
      fee: uniswapFee,
      recipient: address(this),
      deadline: block.timestamp,
      amountIn: _wethAmount,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0
    });

    // Exchange WETH -> _tokenOut via UniswapV3
    uint256 receivedAmount = ISwapRouter(UniswapRouter).exactInputSingle(params);
    require(receivedAmount > 0, Errors.VT_PROCESS_YIELD_INVALID);
    require(
      IERC20(_tokenOut).balanceOf(address(this)) == receivedAmount,
      Errors.VT_PROCESS_YIELD_INVALID
    );

    // Make lendingPool to transfer required amount
    IERC20(_tokenOut).safeApprove(address(_addressesProvider.getLendingPool()), receivedAmount);
    // Deposit Yield to pool
    _depositYield(_tokenOut, receivedAmount);
  }

  /**
   * @dev Get yield amount based on strategy
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(LIDO);
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive stAsset
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    uint256 assetAmount = _amount;
    if (_asset == address(0)) {
      // Case of ETH deposit from user, user has to send ETH
      require(msg.value > 0, Errors.VT_COLLATORAL_DEPOSIT_REQUIRE_ETH);

      // Deposit ETH to Lido and receive stETH
      (bool sent, bytes memory data) = LIDO.call{value: msg.value}('');
      require(sent, Errors.VT_COLLATORAL_DEPOSIT_INVALID);

      assetAmount = msg.value;
    } else {
      // Case of stETH deposit from user, receive stETH from user
      require(_asset == LIDO, Errors.VT_COLLATORAL_DEPOSIT_INVALID);
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
    return (LIDO, _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with stAsset and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override {
    if (_asset == address(0)) {
      // Case of ETH withdraw request from user, so exchange stETH -> ETH via curve
      uint256 receivedETHAmount = _convertAssetByCurve(LIDO, _amount);
      // send ETH to user
      (bool sent, bytes memory data) = address(_to).call{value: receivedETHAmount}('');
      require(sent, Errors.VT_COLLATORAL_WITHDRAW_INVALID);
    } else {
      // Case of stETH withdraw request from user, so directly send
      require(_asset == LIDO, Errors.VT_COLLATORAL_WITHDRAW_INVALID);
      IERC20(LIDO).safeTransfer(_to, _amount);
    }
  }

  /**
   * @dev convert asset via curve
   */
  function _convertAssetByCurve(address _fromAsset, uint256 _fromAmount) private returns (uint256) {
    // Exchange stETH -> ETH via curve
    IERC20(_fromAsset).safeApprove(CurveswapLidoPool, _fromAmount);
    uint256 minAmount = ICurveSwap(CurveswapLidoPool).get_dy(1, 0, _fromAmount);
    uint256 receivedAmount = ICurveSwap(CurveswapLidoPool).exchange(1, 0, _fromAmount, minAmount);
    return receivedAmount;
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(LIDO).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
