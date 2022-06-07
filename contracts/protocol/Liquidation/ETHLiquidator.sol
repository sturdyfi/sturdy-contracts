// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {IFlashLoanReceiver} from '../../flashloan/interfaces/IFlashLoanReceiver.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {IAaveFlashLoan} from '../../interfaces/IAaveFlashLoan.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {IWETH} from '../../misc/interfaces/IWETH.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {CurveswapAdapter} from '../libraries/swap/CurveswapAdapter.sol';
import {UniswapAdapter} from '../libraries/swap/UniswapAdapter.sol';

/**
 * @title ETHLiquidator
 * @notice ETHLiquidator
 * @author Sturdy
 **/

interface ICurvePool {
  function coins(uint256) external view returns (address);

  function calc_withdraw_one_coin(
    uint256 _burn_amount,
    int128 i,
    bool _previous
  ) external view returns (uint256);

  function calc_withdraw_one_coin(uint256 _burn_amount, int128 i) external view returns (uint256);

  function remove_liquidity_one_coin(
    uint256 _burn_amount,
    int128 i,
    uint256 _min_received,
    address _receiver
  ) external returns (uint256);

  function remove_liquidity_one_coin(
    uint256 _burn_amount,
    int128 i,
    uint256 _min_received
  ) external;
}

contract ETHLiquidator is IFlashLoanReceiver, Ownable {
  using SafeERC20 for IERC20;

  address private constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address private constant AAVE_LENDING_POOL_ADDRESS = 0x7937D4799803FbBe595ed57278Bc4cA21f3bFfCB;
  address private constant FRAX_3CRV_LP_ADDRESS = 0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B;
  address private constant POOL_3CRV_ADDRESS = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;

  ILendingPoolAddressesProvider internal _addressesProvider;

  /**
   * @dev Receive ETH
   */
  receive() external payable {}

  /**
   * @dev Function is invoked by the proxy contract when the Adapter contract is deployed.
   * @param _provider The address of the provider
   **/
  constructor(ILendingPoolAddressesProvider _provider) {
    _addressesProvider = _provider;
  }

  function withdraw(address asset) external payable onlyOwner {
    uint256 amount = IERC20(asset).balanceOf(address(this));
    IERC20(asset).safeTransfer(msg.sender, amount);
  }

  /**
   * This function is called after your contract has received the flash loaned amount
   * overriding executeOperation() in IFlashLoanReceiver
   */
  function executeOperation(
    address[] calldata assets,
    uint256[] calldata amounts,
    uint256[] calldata premiums,
    address,
    bytes calldata params
  ) external override returns (bool) {
    // parse params
    (address collateralAddress, address borrowerAddress) = abi.decode(params, (address, address));
    address lendingPool = _addressesProvider.getLendingPool();

    // call liquidation
    IERC20(assets[0]).safeApprove(lendingPool, 0);
    IERC20(assets[0]).safeApprove(lendingPool, amounts[0]);
    ILendingPool(lendingPool).liquidationCall(
      collateralAddress,
      assets[0],
      borrowerAddress,
      amounts[0],
      false
    );

    _convertCollateral(collateralAddress, assets[0]);

    // Approve the LendingPool contract allowance to *pull* the owed amount
    IERC20(assets[0]).safeApprove(AAVE_LENDING_POOL_ADDRESS, 0);
    IERC20(assets[0]).safeApprove(AAVE_LENDING_POOL_ADDRESS, amounts[0] + premiums[0]);

    return true;
  }

  function liquidation(
    address debtAsset,
    uint256 debtToCover,
    bytes calldata params
  ) external {
    IAaveFlashLoan AAVE_LENDING_POOL = IAaveFlashLoan(AAVE_LENDING_POOL_ADDRESS);

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
    ILendingPoolAddressesProvider provider = _addressesProvider;
    uint256 collateralAmount = IERC20(collateralAsset).balanceOf(address(this));

    if (collateralAsset == provider.getAddress('LIDO')) {
      _convertLIDO(provider, asset, collateralAmount);
    } else if (collateralAsset == FRAX_3CRV_LP_ADDRESS) {
      _convertFRAX_3CRV(asset, collateralAmount);
    }
  }

  function _convertLIDO(
    ILendingPoolAddressesProvider provider,
    address asset,
    uint256 collateralAmount
  ) internal {
    // Exchange stETH -> ETH via Curve
    uint256 receivedETHAmount = CurveswapAdapter.swapExactTokensForTokens(
      provider,
      provider.getAddress('STETH_ETH_POOL'),
      provider.getAddress('LIDO'),
      ETH,
      collateralAmount,
      500
    );

    // ETH -> WETH
    address weth = provider.getAddress('WETH');
    IWETH(weth).deposit{value: receivedETHAmount}();

    // WETH -> asset
    UniswapAdapter.Path memory path;
    path.tokens = new address[](2);
    path.tokens[0] = weth;
    path.tokens[1] = asset;

    path.fees = new uint256[](1);
    path.fees[0] = 500;

    UniswapAdapter.swapExactTokensForTokens(provider, weth, asset, receivedETHAmount, path, 500);
  }

  function _convertFRAX_3CRV(address asset, uint256 collateralAmount) internal {
    // Withdraw a single asset(3CRV) from the pool
    uint256 _amount = _withdrawFromCurvePool(collateralAmount);

    // Swap 3CRV to asset
    _swap3CRV(asset, _amount);
  }

  function _withdrawFromCurvePool(uint256 _amount) internal returns (uint256 amount3CRV) {
    int128 _underlying_coin_index = 1; // 3CRV

    uint256 _minAmount = ICurvePool(FRAX_3CRV_LP_ADDRESS).calc_withdraw_one_coin(
      _amount,
      _underlying_coin_index,
      false
    );
    amount3CRV = ICurvePool(FRAX_3CRV_LP_ADDRESS).remove_liquidity_one_coin(
      _amount,
      _underlying_coin_index,
      _minAmount,
      address(this)
    );
  }

  function _swap3CRV(address _assetOut, uint256 _amount) internal {
    require(POOL_3CRV_ADDRESS != address(0), Errors.LP_LIQUIDATION_CONVERT_FAILED);

    int256 _coin_index = 3;
    for (int256 i; i < 3; ++i) {
      if (ICurvePool(POOL_3CRV_ADDRESS).coins(uint256(i)) == _assetOut) {
        _coin_index = i;
        break;
      }
    }

    require(_coin_index < 3, Errors.LP_LIQUIDATION_CONVERT_FAILED);

    uint256 _minAmount = ICurvePool(POOL_3CRV_ADDRESS).calc_withdraw_one_coin(
      _amount,
      int128(_coin_index)
    );

    ICurvePool(POOL_3CRV_ADDRESS).remove_liquidity_one_coin(
      _amount,
      int128(_coin_index),
      _minAmount
    );
  }
}
