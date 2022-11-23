import BigNumber from 'bignumber.js';
import { getMintableERC20 } from '../../../helpers/contracts-getters';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../../helpers/misc-utils';
import { SignerWithAddress } from './make-suite';

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const BAL_WSTETH_WETH_LP = '0x32296969Ef14EB0c6d29669C550D4a0449130230';
const ETH_STETH_LP = '0x06325440D014e39736583c165C2963BA99fAf14E';

const TOKEN_INFO: {
  symbol: string;
  address: string;
  owner: string;
}[] = [
  {
    symbol: 'WETH',
    address: WETH,
    owner: '0x8EB8a3b98659Cce290402893d0123abb75E3ab28',
  },
  {
    symbol: 'BAL_WSTETH_WETH_LP',
    address: BAL_WSTETH_WETH_LP,
    owner: '0x8627425d8b3c16d16683a1e1e17ff00a2596e05f',
  },
  {
    symbol: 'ETH_STETH_LP',
    address: ETH_STETH_LP,
    owner: '0x43378368D84D4bA00D1C8E97EC2E6016A82fC062',
  },
];

export async function mint(reserveSymbol: string, amount: string, user: SignerWithAddress) {
  const ethers = (DRE as any).ethers;

  const token = TOKEN_INFO.find((ele) => ele.symbol.toUpperCase() === reserveSymbol.toUpperCase());
  if (token) {
    const asset = await getMintableERC20(token.address);
    await impersonateAccountsHardhat([token.owner]);
    const signer = await ethers.provider.getSigner(token.owner);
    await waitForTx(await asset.connect(signer).transfer(user.address, amount));
  }
}
