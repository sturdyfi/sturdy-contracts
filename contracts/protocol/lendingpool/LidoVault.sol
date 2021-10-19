// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';
import {GeneralVault} from './GeneralVault.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IWstETH} from '../../interfaces/IWstETH.sol';
import {ICurveSwap} from '../../interfaces/ICurveSwap.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {ISwapRouter} from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import {TransferHelper} from '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

contract LidoVault is GeneralVault {
  using SafeMath for uint256;

  //ToDo: need to think about using registering flow instead of constant value
  address constant LIDO = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
  address constant CurveswapLidoPool = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022;
  address constant UniswapRouter = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
  address constant WstETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;
  address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

  mapping(address => uint256) balanceOfETH;
  uint256 totalBalance;

  constructor(address _lendingPool) public GeneralVault(_lendingPool) {}

  /**
   * @dev Receive Ether
   */
  receive() external payable {}

  /**
   * @dev Grab excess stETH which was from rebasing on Lido
   */
  function processYield() external override onlyOwner {
    uint256 yieldStETH = _getYieldFromLido();
    require(yieldStETH > 0, Errors.VT_PROCESS_YIELD_INVALID);

    // Exchange stETH -> ETH via Curve
    uint256 receivedETHAmount = _convertAssetByCurve(LIDO, yieldStETH);
  }

  /**
   * @dev Get yield amount based on strategy
   */
  function getYield() external view override returns (uint256) {
    return _getYieldFromLido();
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive stAsset
   */
  function depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    uint256 assetAmount = _amount;
    if (_asset == address(0)) {
      require(msg.value > 0, Errors.VT_COLLATORAL_DEPOSIT_REQUIRE_ETH);

      (bool sent, bytes memory data) = LIDO.call{value: msg.value}('');
      require(sent, Errors.VT_COLLATORAL_DEPOSIT_INVALID);

      assetAmount = msg.value;
    } else {
      require(_asset == LIDO, Errors.VT_COLLATORAL_DEPOSIT_INVALID);
      IERC20(LIDO).transferFrom(msg.sender, address(this), _amount);
    }

    balanceOfETH[msg.sender] = balanceOfETH[msg.sender].add(assetAmount);
    totalBalance = totalBalance.add(assetAmount);

    // stETH -> wstETH
    IERC20(LIDO).approve(WstETH, assetAmount);
    uint256 wstETHAmount = IWstETH(WstETH).wrap(assetAmount);
    IWstETH(WstETH).approve(address(lendingPool), wstETHAmount);
    return (WstETH, wstETHAmount);
  }

  /**
   * @dev Get Withdrawal amount of stAsset based on strategy
   */
  function getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    require(_amount <= balanceOfETH[msg.sender], Errors.VT_COLLATORAL_WITHDRAW_INVALID_AMOUNT);

    uint256 wstETHAmount = IWstETH(WstETH).getWstETHByStETH(_amount);
    return (WstETH, wstETHAmount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with stAsset and deliver asset
   */
  function withdrawFromYieldPool(
    address _asset,
    uint256 _amountToWithdraw,
    address _to
  ) internal override {
    uint256 stETHAmount = IWstETH(WstETH).unwrap(_amountToWithdraw);
    require(stETHAmount <= balanceOfETH[msg.sender], Errors.VT_COLLATORAL_WITHDRAW_INVALID_AMOUNT);

    balanceOfETH[msg.sender] = balanceOfETH[msg.sender].sub(stETHAmount);

    if (_asset == address(0)) {
      // Exchange stETH -> ETH via Curve
      uint256 receivedETHAmount = _convertAssetByCurve(LIDO, stETHAmount);
      (bool sent, bytes memory data) = address(_to).call{value: receivedETHAmount}('');
      require(sent, Errors.VT_COLLATORAL_WITHDRAW_INVALID);
    } else {
      require(_asset == LIDO, Errors.VT_COLLATORAL_WITHDRAW_INVALID);
      IERC20(LIDO).transfer(_to, stETHAmount);
    }
  }

  /**
   * @dev Get yield amount based on Lido rebasing
   */
  function _getYieldFromLido() private view returns (uint256) {
    uint256 totalStETH = IERC20(LIDO).balanceOf(address(this));
    if (totalStETH > totalBalance) return totalStETH.sub(totalStETH);

    return 0;
  }

  /**
   * @dev convert asset via curve
   */
  function _convertAssetByCurve(address _fromAsset, uint256 _fromAmount) private returns (uint256) {
    IERC20(_fromAsset).approve(CurveswapLidoPool, _fromAmount);
    uint256 minAmount = ICurveSwap(CurveswapLidoPool).get_dy(1, 0, _fromAmount);
    uint256 receivedAmount = ICurveSwap(CurveswapLidoPool).exchange(1, 0, _fromAmount, minAmount);
    return receivedAmount;
  }
}
