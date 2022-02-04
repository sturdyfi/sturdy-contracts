// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import 'hardhat/console.sol';
import {GeneralVault} from './GeneralVault.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IWETH} from '../../misc/interfaces/IWETH.sol';
import {IYearnVault} from '../../interfaces/IYearnVault.sol';
import {IUniswapV2Router02} from '../../interfaces/IUniswapV2Router02.sol';
import {TransferHelper} from '../libraries/helpers/TransferHelper.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';
import {IERC20Detailed} from '../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../interfaces/IPriceOracleGetter.sol';

/**
 * @title YearnVault
 * @notice yvWFTM/WFTM Vault by using Yearn on Fantom
 * @author Sturdy
 **/
contract YearnVault is GeneralVault {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  /**
   * @dev Receive FTM
   */
  receive() external payable {}

  function processYield() external override onlyAdmin {
    // Get yield from lendingPool
    address YVWFTM = _addressesProvider.getAddress('YVWFTM');
    uint256 yieldYVWFTM = _getYield(YVWFTM);

    // move yield to treasury
    if (_vaultFee > 0) {
      uint256 treasuryYVWFTM = _processTreasury(yieldYVWFTM);
      yieldYVWFTM = yieldYVWFTM.sub(treasuryYVWFTM);
    }

    // Withdraw from Yearn Vault and receive WFTM
    uint256 yieldWFTM = IYearnVault(YVWFTM).withdraw(yieldYVWFTM, address(this), 1);

    // WFTM -> FTM
    IWETH(_addressesProvider.getAddress('WFTM')).withdraw(yieldWFTM);

    AssetYield[] memory assetYields = _getAssetYields(yieldWFTM);
    for (uint256 i = 0; i < assetYields.length; i++) {
      // FTM -> Asset and Deposit to pool
      if (assetYields[i].amount > 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }
  }

  function _convertAndDepositYield(address _tokenOut, uint256 _ftmAmount) internal {
    // Approve the uniswapRouter to spend WFTM.
    address uniswapRouter = _addressesProvider.getAddress('uniswapRouter');
    address WFTM = _addressesProvider.getAddress('WFTM');

    // Calculate minAmount from price with 1% slippage
    uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
    IPriceOracleGetter oracle = IPriceOracleGetter(_addressesProvider.getPriceOracle());
    uint256 minAmountFromPrice = _ftmAmount
      .mul(oracle.getAssetPrice(_addressesProvider.getAddress('YVWFTM')))
      .div(10**18)
      .mul(10**assetDecimal)
      .div(oracle.getAssetPrice(_tokenOut))
      .percentMul(99_00);

    // Exchange FTM -> _tokenOut via UniswapV2
    address[] memory path = new address[](2);
    path[0] = address(WFTM);
    path[1] = _tokenOut;

    uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactETHForTokens{
      value: _ftmAmount
    }(minAmountFromPrice, path, address(this), block.timestamp);
    require(receivedAmounts[1] > 0, Errors.VT_PROCESS_YIELD_INVALID);
    require(
      IERC20(_tokenOut).balanceOf(address(this)) >= receivedAmounts[1],
      Errors.VT_PROCESS_YIELD_INVALID
    );

    // Make lendingPool to transfer required amount
    IERC20(_tokenOut).safeApprove(address(_addressesProvider.getLendingPool()), receivedAmounts[1]);
    // Deposit yield to pool
    _depositYield(_tokenOut, receivedAmounts[1]);
  }

  /**
   * @dev Get yield amount based on strategy
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(_addressesProvider.getAddress('YVWFTM'));
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    return IYearnVault(_addressesProvider.getAddress('YVWFTM')).pricePerShare();
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive yvWFTM
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    address YVWFTM = _addressesProvider.getAddress('YVWFTM');
    address WFTM = _addressesProvider.getAddress('WFTM');
    uint256 assetAmount = _amount;
    if (_asset == address(0)) {
      // Case of FTM deposit from user, user has to send FTM
      require(msg.value > 0, Errors.VT_COLLATERAL_DEPOSIT_REQUIRE_ETH);

      // FTM -> WFTM
      IWETH(WFTM).deposit{value: msg.value}();

      assetAmount = msg.value;
    } else {
      // Case of WFTM deposit from user, receive WFTM from user
      require(_asset == WFTM, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
      TransferHelper.safeTransferFrom(WFTM, msg.sender, address(this), _amount);
    }

    // Deposit WFTM to Yearn Vault and receive yvWFTM
    IERC20(WFTM).approve(YVWFTM, assetAmount);
    assetAmount = IYearnVault(YVWFTM).deposit(assetAmount, address(this));

    // Make lendingPool to transfer required amount
    IERC20(YVWFTM).approve(address(_addressesProvider.getLendingPool()), assetAmount);
    return (YVWFTM, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of yvWFTM based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    // In this vault, return same amount of asset.
    return (_addressesProvider.getAddress('YVWFTM'), _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with yvWFTM and deliver asset
   */
  function _withdrawFromYieldPool(
    address _asset,
    uint256 _amount,
    address _to
  ) internal override {
    address YVWFTM = _addressesProvider.getAddress('YVWFTM');
    address WFTM = _addressesProvider.getAddress('WFTM');

    // Withdraw from Yearn Vault and receive WFTM
    uint256 assetAmount = IYearnVault(YVWFTM).withdraw(_amount, address(this), 1);
    if (_asset == address(0)) {
      // WFTM -> FTM
      IWETH(WFTM).withdraw(assetAmount);

      // send FTM to user
      (bool sent, bytes memory data) = address(_to).call{value: assetAmount}('');
      require(sent, Errors.VT_COLLATERAL_WITHDRAW_INVALID);
    } else {
      require(_asset == WFTM, Errors.VT_COLLATERAL_WITHDRAW_INVALID);

      // Deliver WFTM to user
      TransferHelper.safeTransfer(WFTM, _to, assetAmount);
    }
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('YVWFTM')).safeTransfer(_treasuryAddress, treasuryAmount);
    return treasuryAmount;
  }
}
