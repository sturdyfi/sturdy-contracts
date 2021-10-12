// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

import {IERC20} from '../../../dependencies/openzeppelin/contracts/IERC20.sol';
import {IWstETH} from '../../../interfaces/IWstETH.sol';
import {ICurveSwap} from '../../../interfaces/ICurveSwap.sol';
import {Errors} from '../../libraries/helpers/Errors.sol';
import {SafeMath} from '../../../dependencies/openzeppelin/contracts/SafeMath.sol';

library SturdyLendingPoolLogic {
  using SafeMath for uint256;

  address constant LIDO = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
  address constant CurveSwap = 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022;
  bytes32 constant STORAGE_POSITION = keccak256('sturdy.lending.pool.storage');

  struct SturdyLendingPoolStorage {
    mapping(address => uint256) balanceOfETH;
    uint256 totalBalance;
  }

  function getStorage() public pure returns (SturdyLendingPoolStorage storage ds) {
    bytes32 position = STORAGE_POSITION;
    assembly {
      ds_slot := position
    }
  }

  function getCollateralAmount(address WstETH) external returns (uint256 wstETHAmount) {
    require(msg.value > 0, Errors.ST_COLLATORAL_DEPOSIT_REQUIRE_ETH);

    SturdyLendingPoolStorage storage ds = getStorage();
    ds.balanceOfETH[msg.sender] = ds.balanceOfETH[msg.sender].add(msg.value);
    ds.totalBalance = ds.totalBalance.add(msg.value);
    (bool sent, bytes memory data) = LIDO.call{value: msg.value}('');
    require(sent, Errors.ST_COLLATORAL_DEPOSIT_INVALID);

    // stETH -> wstETH
    IERC20(LIDO).approve(WstETH, msg.value);
    wstETHAmount = IWstETH(WstETH).wrap(msg.value);
  }

  function getWithdrawalAmount(address WstETH, uint256 amount)
    external
    view
    returns (uint256 wstETHAmount)
  {
    SturdyLendingPoolStorage storage ds = getStorage();
    require(amount <= ds.balanceOfETH[msg.sender], Errors.ST_COLLATORAL_WITHDRAW_INVALID_AMOUNT);

    wstETHAmount = IWstETH(WstETH).getWstETHByStETH(amount);
  }

  function processWithdraw(
    address WstETH,
    uint256 amountToWithdraw,
    address to
  ) external {
    SturdyLendingPoolStorage storage ds = getStorage();
    uint256 _stETHAmount = IWstETH(WstETH).unwrap(amountToWithdraw);

    ds.balanceOfETH[msg.sender] = ds.balanceOfETH[msg.sender].sub(_stETHAmount);

    // Exchange stETH -> ETH via Curve
    IERC20(LIDO).approve(CurveSwap, _stETHAmount);
    uint256 _minAmount = ICurveSwap(CurveSwap).get_dy(1, 0, _stETHAmount);
    uint256 _receivedAmount = ICurveSwap(CurveSwap).exchange(1, 0, _stETHAmount, _minAmount);
    (bool sent, bytes memory data) = address(msg.sender).call{value: _receivedAmount}('');
    require(sent, Errors.ST_COLLATORAL_WITHDRAW_INVALID);
  }
}
