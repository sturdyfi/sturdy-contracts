// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {GeneralVault} from '../GeneralVault.sol';
import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IBeefyVault} from '../../../interfaces/IBeefyVault.sol';
import {ICurvePool} from '../../../interfaces/ICurvePool.sol';
import {IERC20Detailed} from '../../../dependencies/openzeppelin/contracts/IERC20Detailed.sol';
import {IPriceOracleGetter} from '../../../interfaces/IPriceOracleGetter.sol';
import {IUniswapV2Router02} from '../../../interfaces/IUniswapV2Router02.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {SafeERC20} from '../../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../../libraries/math/PercentageMath.sol';
import {ILendingPool} from '../../../interfaces/ILendingPool.sol';
import {ILendingPoolAddressesProvider} from '../../../interfaces/ILendingPoolAddressesProvider.sol';

/**
 * @title BeefyMIM2CRVVault
 * @notice mooAbrcdbrMIM-2CRV/3poolV2-f(MIM/fUSDT/USDC) Vault by using Beefy on Fantom
 * @author Sturdy
 **/
contract BeefyMIM2CRVVault is GeneralVault {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  address internal constant USDC = 0x04068DA6C83AFCFA0e13ba15A6696662335D5B75;

  function processYield() external override onlyYieldProcessor {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    // Get yield from lendingPool
    address MOOMIM2CRV = provider.getAddress('MOOMIM2CRV');
    address MIM2CRV = provider.getAddress('MIM_2CRV_LP');
    uint256 yieldMOOMIM2CRV = _getYield(MOOMIM2CRV);

    // Some ERC20 do not allow zero amounts to be sent:
    if (yieldMOOMIM2CRV == 0) return;

    // move yield to treasury
    if (_vaultFee != 0) {
      uint256 trasuryAmount = _processTreasury(yieldMOOMIM2CRV);
      yieldMOOMIM2CRV -= trasuryAmount;
    }

    // Withdraw from Beefy Vault and receive MIM2CRV LP token
    uint256 before = IERC20(MIM2CRV).balanceOf(address(this));
    IBeefyVault(MOOMIM2CRV).withdraw(yieldMOOMIM2CRV);
    uint256 yieldMIM2CRV = IERC20(MIM2CRV).balanceOf(address(this)) - before;

    // From curve pool, MIM2CRV -> USDC
    uint256 yieldUSDC = _withdrawFromLiquidityPool(MIM2CRV, yieldMIM2CRV);

    // Distribute yield
    AssetYield[] memory assetYields = _getAssetYields(yieldUSDC);
    uint256 length = assetYields.length;
    for (uint256 i; i < length; ++i) {
      // MIM2CRV -> Asset and Deposit to pool
      if (assetYields[i].amount != 0) {
        _convertAndDepositYield(assetYields[i].asset, assetYields[i].amount);
      }
    }

    emit ProcessYield(MIM2CRV, yieldMIM2CRV);
  }

  function _withdrawFromLiquidityPool(address _poolAddress, uint256 _amount)
    internal
    returns (uint256 amountUSDC)
  {
    require(ICurvePool(_poolAddress).coins(2) == USDC, 'Invalid Pool Address');

    int128 _underlying_coin_index = 2; // USDC

    uint256 _minAmount = ICurvePool(_poolAddress).calc_withdraw_one_coin(
      _amount,
      _underlying_coin_index
    );
    amountUSDC = ICurvePool(_poolAddress).remove_liquidity_one_coin(
      _amount,
      _underlying_coin_index,
      _minAmount,
      address(this)
    );
  }

  /**
   * @dev Swap 'USDC' with stable coins using SpookySwap
   */
  function _convertAndDepositYield(address _tokenOut, uint256 _usdcAmount) internal {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address uniswapRouter = provider.getAddress('uniswapRouter');
    address lendingPoolAddress = provider.getLendingPool();
    uint256 _tokenAmount = _usdcAmount;

    if (_tokenOut != USDC) {
      // Calculate minAmount from price with 5% slippage
      uint256 usdcDecimal = IERC20Detailed(USDC).decimals();
      uint256 assetDecimal = IERC20Detailed(_tokenOut).decimals();
      IPriceOracleGetter oracle = IPriceOracleGetter(provider.getPriceOracle());

      uint256 minAmountFromPrice = ((((_usdcAmount * oracle.getAssetPrice(USDC)) /
        10**usdcDecimal) * 10**assetDecimal) / oracle.getAssetPrice(_tokenOut)).percentMul(95_00);

      // Exchange USDC -> _tokenOut via UniswapV2
      address[] memory path = new address[](3);
      path[0] = address(USDC);
      path[1] = address(provider.getAddress('WFTM'));
      path[2] = _tokenOut;

      IERC20(USDC).safeApprove(uniswapRouter, 0);
      IERC20(USDC).safeApprove(uniswapRouter, _usdcAmount);

      uint256[] memory receivedAmounts = IUniswapV2Router02(uniswapRouter).swapExactTokensForTokens(
        _usdcAmount,
        minAmountFromPrice,
        path,
        address(this),
        block.timestamp
      );

      require(receivedAmounts[2] != 0, Errors.VT_PROCESS_YIELD_INVALID);
      require(
        IERC20(_tokenOut).balanceOf(address(this)) >= receivedAmounts[2],
        Errors.VT_PROCESS_YIELD_INVALID
      );
      _tokenAmount = receivedAmounts[2];
    }

    // Make lendingPool to transfer required amount
    IERC20(_tokenOut).safeApprove(lendingPoolAddress, 0);
    IERC20(_tokenOut).safeApprove(lendingPoolAddress, _tokenAmount);

    // Deposit yield to pool
    _depositYield(_tokenOut, _tokenAmount);
  }

  function withdrawOnLiquidation(address _asset, uint256 _amount)
    external
    override
    returns (uint256)
  {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address MIM2CRV = provider.getAddress('MIM_2CRV_LP');

    require(_asset == MIM2CRV, Errors.LP_LIQUIDATION_CALL_FAILED);
    require(msg.sender == provider.getLendingPool(), Errors.LP_LIQUIDATION_CALL_FAILED);

    // Withdraw from Beefy Vault and receive MIM2CRV
    uint256 before = IERC20(MIM2CRV).balanceOf(address(this));
    IBeefyVault(provider.getAddress('MOOMIM2CRV')).withdraw(_amount);
    uint256 assetAmount = IERC20(MIM2CRV).balanceOf(address(this)) - before;

    // Deliver MIM2CRV to user
    IERC20(MIM2CRV).safeTransfer(msg.sender, assetAmount);

    return assetAmount;
  }

  /**
   * @dev Get yield amount based on strategy
   */
  function getYieldAmount() external view returns (uint256) {
    return _getYieldAmount(_addressesProvider.getAddress('MOOMIM2CRV'));
  }

  /**
   * @dev Get price per share based on yield strategy
   */
  function pricePerShare() external view override returns (uint256) {
    return IBeefyVault(_addressesProvider.getAddress('MOOMIM2CRV')).getPricePerFullShare();
  }

  /**
   * @dev Deposit to yield pool based on strategy and receive MOOMIM2CRV
   */
  function _depositToYieldPool(address _asset, uint256 _amount)
    internal
    override
    returns (address, uint256)
  {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address MOOMIM2CRV = provider.getAddress('MOOMIM2CRV');
    address MIM2CRV = provider.getAddress('MIM_2CRV_LP');
    address lendingPoolAddress = address(provider.getLendingPool());

    require(_asset == MIM2CRV, Errors.VT_COLLATERAL_DEPOSIT_INVALID);
    IERC20(MIM2CRV).safeTransferFrom(msg.sender, address(this), _amount);

    // Deposit MIM2CRV to Beefy Vault and receive mooAbrcdbrMIM-2CRV
    IERC20(MIM2CRV).safeApprove(MOOMIM2CRV, 0);
    IERC20(MIM2CRV).safeApprove(MOOMIM2CRV, _amount);

    uint256 before = IERC20(MOOMIM2CRV).balanceOf(address(this));
    IBeefyVault(MOOMIM2CRV).deposit(_amount);
    uint256 assetAmount = IERC20(MOOMIM2CRV).balanceOf(address(this)) - before;

    // Make lendingPool to transfer required amount
    IERC20(MOOMIM2CRV).safeApprove(lendingPoolAddress, 0);
    IERC20(MOOMIM2CRV).safeApprove(lendingPoolAddress, assetAmount);
    return (MOOMIM2CRV, assetAmount);
  }

  /**
   * @dev Get Withdrawal amount of mooScreamETH based on strategy
   */
  function _getWithdrawalAmount(address _asset, uint256 _amount)
    internal
    view
    override
    returns (address, uint256)
  {
    ILendingPoolAddressesProvider provider = _addressesProvider;

    require(_asset == provider.getAddress('MIM_2CRV_LP'), Errors.VT_COLLATERAL_WITHDRAW_INVALID);

    // In this vault, return same amount of asset.
    return (provider.getAddress('MOOMIM2CRV'), _amount);
  }

  /**
   * @dev Withdraw from yield pool based on strategy with mooAbrcdbrMIM-2CRV and deliver asset
   */
  function _withdrawFromYieldPool(
    address,
    uint256 _amount,
    address _to
  ) internal override returns (uint256) {
    ILendingPoolAddressesProvider provider = _addressesProvider;
    address MIM2CRV = provider.getAddress('MIM_2CRV_LP');

    // Withdraw from Beefy Vault and receive MIM2CRV
    uint256 before = IERC20(MIM2CRV).balanceOf(address(this));
    IBeefyVault(provider.getAddress('MOOMIM2CRV')).withdraw(_amount);
    uint256 assetAmount = IERC20(MIM2CRV).balanceOf(address(this)) - before;

    // Deliver MIM2CRV to user
    IERC20(MIM2CRV).safeTransfer(_to, assetAmount);
    return assetAmount;
  }

  /**
   * @dev Get the list of asset and asset's yield amount
   **/
  function _getAssetYields(uint256 _amount) internal view returns (AssetYield[] memory) {
    // Get total borrowing asset volume and volumes and assets
    (
      uint256 totalVolume,
      uint256[] memory volumes,
      address[] memory assets,
      uint256 length
    ) = ILendingPool(_addressesProvider.getLendingPool()).getBorrowingAssetAndVolumes();

    if (totalVolume == 0) return new AssetYield[](0);

    AssetYield[] memory assetYields = new AssetYield[](length);
    uint256 remainedAmount = _amount;

    for (uint256 i; i < length; ++i) {
      assetYields[i].asset = assets[i];
      if (i == length - 1) {
        // without calculation, set remained extra amount
        assetYields[i].amount = remainedAmount;
      } else {
        // Distribute wethAmount based on percent of asset volume
        assetYields[i].amount = _amount.percentMul(
          (volumes[i] * PercentageMath.PERCENTAGE_FACTOR) / totalVolume
        );
        remainedAmount -= assetYields[i].amount;
      }
    }

    return assetYields;
  }

  function _depositYield(address _asset, uint256 _amount) internal {
    ILendingPool(_addressesProvider.getLendingPool()).depositYield(_asset, _amount);
  }

  /**
   * @dev Move some yield to treasury
   */
  function _processTreasury(uint256 _yieldAmount) internal returns (uint256) {
    uint256 treasuryAmount = _yieldAmount.percentMul(_vaultFee);
    IERC20(_addressesProvider.getAddress('MOOMIM2CRV')).safeTransfer(
      _treasuryAddress,
      treasuryAmount
    );
    return treasuryAmount;
  }
}
