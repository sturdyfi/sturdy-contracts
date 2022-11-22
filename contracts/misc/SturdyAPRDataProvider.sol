// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {IProtocolDataProvider} from '../interfaces/IProtocolDataProvider.sol';
import {ILendingPool} from '../interfaces/ILendingPool.sol';
import {Ownable} from '../dependencies/openzeppelin/contracts/Ownable.sol';
import {Errors} from '../protocol/libraries/helpers/Errors.sol';

contract SturdyAPRDataProvider is Ownable {
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  uint256 private constant YEAR_BLOCK_CNT = 2_102_400; // 4 * 60 * 24 * 365

  IProtocolDataProvider private immutable DATA_PROVIDER;
  ILendingPool private immutable LENDING_POOL;

  //borrow reserve's yield ratio with wad decimal(=18) and previous yield processing block number
  mapping(address => uint256) public prevBlock;
  mapping(address => uint256) public yieldRatio;

  modifier onlyLendingPool() {
    require(msg.sender == address(LENDING_POOL), Errors.CT_CALLER_MUST_BE_LENDING_POOL);
    _;
  }

  constructor(address _provider) public {
    DATA_PROVIDER = IProtocolDataProvider(_provider);
    LENDING_POOL = ILendingPool(DATA_PROVIDER.ADDRESSES_PROVIDER().getLendingPool());
    prevBlock[WETH] = block.number;
  }

  /**
   * @dev Update reserve's APR based on yield
   */
  function updateAPR(
    address _borrowReserve,
    uint256 _yield,
    uint256 _totalSupply
  ) external onlyLendingPool {
    uint256 ratioInWad = (1e18 * _yield) / _totalSupply;
    yieldRatio[_borrowReserve] =
      (ratioInWad * YEAR_BLOCK_CNT) /
      (block.number - prevBlock[_borrowReserve]);
    prevBlock[_borrowReserve] = block.number;
  }

  /**
   * @dev Get APR with wad decimal(=18)
   */
  function APR(address _borrowReserve) external view returns (uint256) {
    return yieldRatio[_borrowReserve];
  }
}
