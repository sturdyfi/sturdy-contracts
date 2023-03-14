// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {Ownable} from '../../dependencies/openzeppelin/contracts/Ownable.sol';
import {IFlashLoanReceiver} from '../../flashloan/interfaces/IFlashLoanReceiver.sol';
import {IFlashLoanRecipient} from '../../flashloan/interfaces/IFlashLoanRecipient.sol';
import {ILendingPoolAddressesProvider} from '../../interfaces/ILendingPoolAddressesProvider.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {IPriceOracleGetter} from '../../interfaces/IPriceOracleGetter.sol';
import {IAaveFlashLoan} from '../../interfaces/IAaveFlashLoan.sol';
import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {Errors} from '../libraries/helpers/Errors.sol';
import {IWETH} from '../../misc/interfaces/IWETH.sol';
import {IBalancerVault} from '../../interfaces/IBalancerVault.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {PercentageMath} from '../libraries/math/PercentageMath.sol';

/**
 * @title ETHLiquidator
 * @notice ETHLiquidator
 * @author Sturdy
 **/

interface ICurvePool {
  function calc_withdraw_one_coin(uint256 _token_amount, int128 i) external view returns (uint256);

  function remove_liquidity_one_coin(
    uint256 _token_amount,
    int128 i,
    uint256 _min_amount
  ) external returns (uint256);
}

contract ETHLiquidator is IFlashLoanReceiver, IFlashLoanRecipient, Ownable {
  using SafeERC20 for IERC20;
  using PercentageMath for uint256;

  enum FlashLoanType {
    AAVE,
    BALANCER
  }

  address private constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address private constant AAVE_LENDING_POOL_ADDRESS = 0x7937D4799803FbBe595ed57278Bc4cA21f3bFfCB;
  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
  address private constant ETH_STETH_LP_ADDRESS = 0x06325440D014e39736583c165C2963BA99fAf14E;
  ICurvePool private constant ETH_STETH_POOL_ADDRESS =
    ICurvePool(0xDC24316b9AE028F1497c275EB9192a3Ea0f67022);
  address private constant BAL_WSTETH_WETH_LP_ADDRESS = 0x32296969Ef14EB0c6d29669C550D4a0449130230;
  bytes32 internal constant BAL_WSTETH_WETH_POOLID =
    0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080;
  address private constant BAL_RETH_WETH_LP_ADDRESS = 0x1E19CF2D73a72Ef1332C882F20534B6519Be0276;
  bytes32 internal constant BAL_RETH_WETH_POOLID =
    0x1e19cf2d73a72ef1332c882f20534b6519be0276000200000000000000000112;
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  address private constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;
  address internal constant RETH = 0xae78736Cd615f374D3085123A210448E74Fc6393;

  ILendingPoolAddressesProvider private immutable PROVIDER;
  address private immutable LENDING_POOL;
  IPriceOracleGetter private immutable ORACLE;

  //1 == not inExec
  //2 == inExec;
  //setting default to 1 to save some gas.
  uint256 private _balancerFlashLoanLock = 1;

  /**
   * @dev Receive ETH
   */
  receive() external payable {}

  /**
   * @dev Function is invoked by the proxy contract when the Adapter contract is deployed.
   * @param _provider The address of the provider
   **/
  constructor(ILendingPoolAddressesProvider _provider) {
    PROVIDER = _provider;
    LENDING_POOL = _provider.getLendingPool();
    ORACLE = IPriceOracleGetter(_provider.getPriceOracle());
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
    address initiator,
    bytes calldata params
  ) external override returns (bool) {
    require(initiator == address(this), Errors.LS_INVALID_CONFIGURATION);
    require(msg.sender == AAVE_LENDING_POOL_ADDRESS, Errors.LS_INVALID_CONFIGURATION);
    require(assets[0] == WETH, Errors.LS_INVALID_CONFIGURATION);

    _executeOperation(amounts[0], premiums[0], params);

    // Approve the LendingPool contract allowance to *pull* the owed amount
    IERC20(WETH).safeApprove(AAVE_LENDING_POOL_ADDRESS, 0);
    IERC20(WETH).safeApprove(AAVE_LENDING_POOL_ADDRESS, amounts[0] + premiums[0]);

    return true;
  }

  /**
   * This function is called after your contract has received the flash loaned amount
   * overriding receiveFlashLoan() in IFlashLoanRecipient
   */
  function receiveFlashLoan(
    IERC20[] memory tokens,
    uint256[] memory amounts,
    uint256[] memory feeAmounts,
    bytes memory userData
  ) external override {
    require(msg.sender == BALANCER_VAULT, Errors.LS_INVALID_CONFIGURATION);
    require(_balancerFlashLoanLock == 2, Errors.LS_INVALID_CONFIGURATION);
    require(address(tokens[0]) == WETH, Errors.LS_INVALID_CONFIGURATION);
    _balancerFlashLoanLock = 1;

    _executeOperation(amounts[0], feeAmounts[0], userData);

    // send tokens to Balancer vault contract
    IERC20(WETH).safeTransfer(msg.sender, amounts[0] + feeAmounts[0]);
  }

  function _executeOperation(uint256 borrowAmount, uint256 fee, bytes memory params) internal {
    // call liquidation
    IERC20(WETH).safeApprove(LENDING_POOL, 0);
    IERC20(WETH).safeApprove(LENDING_POOL, borrowAmount);

    (address collateralAddress, address borrowerAddress, ) = abi.decode(
      params,
      (address, address, uint256)
    );
    ILendingPool(LENDING_POOL).liquidationCall(
      collateralAddress,
      WETH,
      borrowerAddress,
      borrowAmount,
      false
    );

    _convertCollateral(params);
  }

  function liquidation(
    uint256 debtToCover,
    FlashLoanType _flashLoanType,
    bytes calldata params
  ) external {
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = debtToCover;

    if (_flashLoanType == FlashLoanType.AAVE) {
      address[] memory assets = new address[](1);
      assets[0] = WETH;

      // 0 means revert the transaction if not validated
      uint256[] memory modes = new uint256[](1);
      modes[0] = 0;

      IAaveFlashLoan(AAVE_LENDING_POOL_ADDRESS).flashLoan(
        address(this),
        assets,
        amounts,
        modes,
        address(this),
        params,
        0
      );
    } else {
      require(_balancerFlashLoanLock == 1, Errors.LS_INVALID_CONFIGURATION);
      IERC20[] memory assets = new IERC20[](1);
      assets[0] = IERC20(WETH);
      _balancerFlashLoanLock = 2;
      IBalancerVault(BALANCER_VAULT).flashLoan(address(this), assets, amounts, params);
    }
  }

  /**
   * Swap from collateralAsset to debtAsset
   */
  function _convertCollateral(bytes memory params) internal {
    (address collateralAsset, , uint256 slippage) = abi.decode(params, (address, address, uint256));
    uint256 collateralAmount = IERC20(collateralAsset).balanceOf(address(this));

    if (collateralAsset == ETH_STETH_LP_ADDRESS) {
      _convertETH_STETH(collateralAmount);
    } else if (collateralAsset == BAL_WSTETH_WETH_LP_ADDRESS) {
      _convertBAL_WSTETH_WETH(collateralAmount, slippage);
    } else if (collateralAsset == BAL_RETH_WETH_LP_ADDRESS) {
      _convertBAL_RETH_WETH(collateralAmount, slippage);
    }
  }

  function _convertETH_STETH(uint256 collateralAmount) internal {
    // ETH_STETH -> ETH
    uint256 minAmount = ETH_STETH_POOL_ADDRESS.calc_withdraw_one_coin(collateralAmount, 0);
    uint256 ethAmount = ETH_STETH_POOL_ADDRESS.remove_liquidity_one_coin(
      collateralAmount,
      0,
      minAmount
    );

    // ETH -> WETH
    IWETH(WETH).deposit{value: ethAmount}();
  }

  function _convertBAL_WSTETH_WETH(uint256 collateralAmount, uint256 slippage) internal {
    // BAL_WSTETH_WETH -> WETH
    address[] memory assets = new address[](2);
    assets[0] = WSTETH;
    assets[1] = WETH;

    uint256[] memory initBalances = new uint256[](2);
    initBalances[1] = _getMinAmount(
      collateralAmount,
      slippage,
      _getAssetPrice(BAL_WSTETH_WETH_LP_ADDRESS),
      1e18
    );

    uint256 exitKind = uint256(IBalancerVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT);
    bytes memory userDataEncoded = abi.encode(exitKind, collateralAmount, 1);

    IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest({
      assets: assets,
      minAmountsOut: initBalances,
      userData: userDataEncoded,
      toInternalBalance: false
    });

    IBalancerVault(BALANCER_VAULT).exitPool(
      BAL_WSTETH_WETH_POOLID,
      address(this),
      payable(address(this)),
      request
    );
  }

  function _convertBAL_RETH_WETH(uint256 collateralAmount, uint256 slippage) internal {
    // BAL_RETH_WETH -> WETH
    address[] memory assets = new address[](2);
    assets[0] = RETH;
    assets[1] = WETH;

    uint256[] memory initBalances = new uint256[](2);
    initBalances[1] = _getMinAmount(
      collateralAmount,
      slippage,
      _getAssetPrice(BAL_RETH_WETH_LP_ADDRESS),
      1e18
    );

    uint256 exitKind = uint256(IBalancerVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT);
    bytes memory userDataEncoded = abi.encode(exitKind, collateralAmount, 1);

    IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest({
      assets: assets,
      minAmountsOut: initBalances,
      userData: userDataEncoded,
      toInternalBalance: false
    });

    IBalancerVault(BALANCER_VAULT).exitPool(
      BAL_RETH_WETH_POOLID,
      address(this),
      payable(address(this)),
      request
    );
  }

  function _getAssetPrice(address _asset) internal view returns (uint256) {
    return ORACLE.getAssetPrice(_asset);
  }

  function _getMinAmount(
    uint256 _amountToSwap,
    uint256 _slippage,
    uint256 _fromAssetPrice,
    uint256 _toAssetPrice
  ) internal view returns (uint256) {
    return
      ((_amountToSwap * _fromAssetPrice) / _toAssetPrice).percentMul(
        PercentageMath.PERCENTAGE_FACTOR - _slippage
      );
  }
}
