import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';

function almostEqualAssertion(this: any, expected: any, actual: any, message: string): any {
  this.assert(
    expected.plus(new BigNumber(1)).eq(actual) ||
      expected.plus(new BigNumber(2)).eq(actual) ||
      actual.plus(new BigNumber(1)).eq(expected) ||
      actual.plus(new BigNumber(2)).eq(expected) ||
      expected.eq(actual),
    `${message} expected #{act} to be almost equal #{exp}`,
    `${message} expected #{act} to be different from #{exp}`,
    expected.toString(),
    actual.toString()
  );
}

export function almostEqual() {
  return function (chai: any, utils: any) {
    chai.Assertion.overwriteMethod('almostEqual', function (original: any) {
      return function (this: any, value: any, message: string) {
        if (utils.flag(this, 'bignumber')) {
          var expected = new BigNumber(value);
          var actual = new BigNumber(this._obj);
          almostEqualAssertion.apply(this, [expected, actual, message]);
        } else {
          original.apply(this, arguments);
        }
      };
    });
  };
}

export const isSimilar = (a: BigNumberish, b: BigNumberish, decimals: number): boolean => {
  const A = new BigNumber(a.toString());
  const B = new BigNumber(b.toString());
  const Bplus1 = new BigNumber(b.toString()).plus(parseUnits('1', decimals).toString());
  const Bminus1 = new BigNumber(b.toString()).minus(parseUnits('1', decimals).toString());

  // a == b
  if (A.eq(B)) return true;
  // b - 1 < a < b
  if (A.gt(Bminus1) && A.lt(B)) return true;
  // b < a < b + 1
  if (A.gt(B) && A.lt(Bplus1)) return true;
  
  console.log('A is ' + A.toString() + ' B is ' + B.toString());
  return false;
}