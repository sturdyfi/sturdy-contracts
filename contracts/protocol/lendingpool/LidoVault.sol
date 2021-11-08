// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';
import {GeneralVault} from './GeneralVault.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IWETH} from '../../misc/interfaces/IWETH.sol';
import {ICurveSwap} from '../../interfaces/ICurveSwap.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {ISwapRouter} from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import {TransferHelper} from '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';

contract LidoVault is GeneralVault {
  using SafeMath for uint256;
  using PercentageMath for uint256;

  //ToDo: need to think about using registering flow instead of constant value
  address constant LIDO = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
  address constant CurveswapLidoPool = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022;
  address constant UniswapRouter = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
  address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

  // uniswap pool fee to 0.05%.
  uint24 constant uniswapFee = 500;

  constructor(address _lendingPool) public GeneralVault(_lendingPool) {}

  /**
   * @dev Receive Ether
   */
  receive() external payable {}

  /**
   * @dev Grab excess stETH which was from rebasing on Lido
   *  And convert stETH -> ETH -> USDC
   */
  function processYield() external override onlyOwner {
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

    // Approve the uniswapRouter to spend WETH.
    TransferHelper.safeApprove(WETH, UniswapRouter, receivedETHAmount);

    // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
    // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
    ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
      tokenIn: WETH,
      tokenOut: USDC,
      fee: uniswapFee,
      recipient: address(this),
      deadline: block.timestamp,
      amountIn: receivedETHAmount,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0
    });

    // Exchange WETH -> USDC via UniswapV3
    uint256 receivedUSDCAmount = ISwapRouter(UniswapRouter).exactInputSingle(params);
    require(receivedUSDCAmount > 0, Errors.VT_PROCESS_YIELD_INVALID);
    require(
      IERC20(USDC).balanceOf(address(this)) == receivedUSDCAmount,
      Errors.VT_PROCESS_YIELD_INVALID
    );

    // Make lendingPool to transfer required amount
    IERC20(USDC).approve(address(lendingPool), receivedUSDCAmount);
    // Deposit Yield to pool
    _depositYield(USDC, receivedUSDCAmount);
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
      IERC20(LIDO).transferFrom(msg.sender, address(this), _amount);
    }

    // Make lendingPool to transfer required amount
    IERC20(LIDO).approve(address(lendingPool), assetAmount);
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
      IERC20(LIDO).transfer(_to, _amount);
    }
  }

  /**
   * @dev convert asset via curve
   */
  function _convertAssetByCurve(address _fromAsset, uint256 _fromAmount) private returns (uint256) {
    // Exchange stETH -> ETH via curve
    IERC20(_fromAsset).approve(CurveswapLidoPool, _fromAmount);
    uint256 minAmount = ICurveSwap(CurveswapLidoPool).get_dy(1, 0, _fromAmount);
    uint256 receivedAmount = ICurveSwap(CurveswapLidoPool).exchange(1, 0, _fromAmount, minAmount);
    return receivedAmount;
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(LIDO).transfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
