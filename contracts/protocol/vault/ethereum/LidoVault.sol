// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {GeneralVault} from '../GeneralVault.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IWETH} from '../../../misc/interfaces/IWETH.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {TransferHelper} from '../../libraries/helpers/TransferHelper.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {CurveswapAdapter} from '../../libraries/swap/CurveswapAdapter.sol';
import {ILendingPoolAddressesProvider} from '../../../interfaces/ILendingPoolAddressesProvider.sol';

/**
 * @title LidoVault
 * @notice stETH/ETH Vault by using Lido, Uniswap, Curve
 * @author Sturdy
 **/
contract LidoVault is GeneralVault {
  using SafeERC20 for IERC20;

  /**
   * @dev Receive Ether
   */
  receive() external payable {}

  /**
   * @dev Grab excess stETH which was from rebasing on Lido
   *  And convert stETH -> ETH -> asset, deposit to pool
   */
  function processYield() external override {
    // Get yield from lendingPool
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address LIDO = provider.getAddress('LIDO');
    uint256 yieldStETH = _getYield(LIDO);

    // move yield to treasury
    uint256 fee = _vaultFee;
    if (fee > 0) {
      uint256 treasuryStETH = yieldStETH.percentMul(fee);
      IERC20(LIDO).safeTransfer(_treasuryAddress, treasuryStETH);
      yieldStETH = yieldStETH.sub(treasuryStETH);
    }

    // Exchange stETH -> ETH via Curve
    uint256 receivedETHAmount = CurveswapAdapter.swapExactTokensForTokens(
      provider,
      provider.getAddress('STETH_ETH_POOL'),
      LIDO,
      ETH,
      yieldStETH,
      200
    );

    // ETH -> WETH
    address weth = provider.getAddress('WETH');
    IWETH(weth).deposit{value: receivedETHAmount}();

    // transfer WETH to yieldManager
    address yieldManager = provider.getAddress('YIELD_MANAGER');
    TransferHelper.safeTransfer(weth, yieldManager, receivedETHAmount);

    emit ProcessYield(weth, receivedETHAmount);
  }

  /**
   * @dev Get yield amount based on strategy
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(_addressesProvider.getAddress('LIDO'));
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    return 1e18;
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive stAsset
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address LIDO = provider.getAddress('LIDO');
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
    IERC20(LIDO).safeApprove(address(provider.getLendingPool()), assetAmount);
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
    address LIDO = _addressesProvider.getAddress('LIDO');
    require(_asset == LIDO || _asset == address(0), Errors.VT_COLLATERAL_WITHDRAW_INVALID);

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
  ) internal override returns (uint256) {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address LIDO = provider.getAddress('LIDO');
    if (_asset == address(0)) {
      // Case of ETH withdraw request from user, so exchange stETH -> ETH via curve
      uint256 receivedETHAmount = CurveswapAdapter.swapExactTokensForTokens(
        provider,
        provider.getAddress('STETH_ETH_POOL'),
        LIDO,
        ETH,
        _amount,
        200
      );

      // send ETH to user
      (bool sent, bytes memory data) = address(_to).call{value: receivedETHAmount}('');
      require(sent, Errors.VT_COLLATERAL_WITHDRAW_INVALID);
      return receivedETHAmount;
    } else {
      // Case of stETH withdraw request from user, so directly send
      IERC20(LIDO).safeTransfer(_to, _amount);
    }
    return _amount;
  }
}
