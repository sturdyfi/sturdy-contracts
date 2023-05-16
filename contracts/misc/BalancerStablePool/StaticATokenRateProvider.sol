// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.0;

import '../interfaces/IRateProvider.sol';
import '../interfaces/IStaticAToken.sol';

/**
 * @title Wrapped aToken Rate Provider
 * @notice Returns the value of a wrapped (static) aToken in terms of the underlying (dynamic) aToken
 */
contract StaticATokenRateProvider is IRateProvider {
  ILendingPool public immutable lendingPool;
  address public immutable asset;

  constructor(IStaticAToken _waToken) {
    lendingPool = _waToken.LENDING_POOL();
    asset = _waToken.ASSET();
  }

  /**
   * @return The value of the wrapped aToken in terms of the underlying aToken
   */
  function getRate() external view override returns (uint256) {
    // This pulls the implementation of used in the StaticAToken contract
    // except avoiding storing relevant variables in storage for gas reasons.
    // solhint-disable-next-line max-line-length
    // see: https://github.com/aave/protocol-v2/blob/ac58fea62bb8afee23f66197e8bce6d79ecda292/contracts/protocol/tokenization/StaticATokenLM.sol#L255-L257
    uint256 rate = lendingPool.getReserveNormalizedIncome(asset);

    // getRate returns a 18 decimal fixed point number, but `rate` has 27 decimals (i.e. a 'ray' value)
    // so we need to convert it.
    return rate / 10 ** 9;
  }
}
