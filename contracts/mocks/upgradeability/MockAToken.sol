// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.6.12;

import {AToken} from '../../protocol/tokenization/AToken.sol';
import {ILendingPool} from '../../interfaces/ILendingPool.sol';
import {ISturdyIncentivesController} from '../../interfaces/ISturdyIncentivesController.sol';

contract MockAToken is AToken {
  function getRevision() internal pure override returns (uint256) {
    return 0x2;
  }
}
