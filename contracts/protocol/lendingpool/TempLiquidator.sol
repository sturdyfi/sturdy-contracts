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
import {PercentageMath} from '../libraries/math/PercentageMath.sol';

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
}
