import BigNumber from 'bignumber.js';
import { getMintableERC20 } from '../../../helpers/contracts-getters';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../../helpers/misc-utils';
import { SignerWithAddress } from './make-suite';

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const BAL_WSTETH_WETH_LP = '0x32296969Ef14EB0c6d29669C550D4a0449130230';
const BAL_RETH_WETH_LP = '0x1E19CF2D73a72Ef1332C882F20534B6519Be0276';
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
    owner: '0x21ac89788d52070D23B8EaCEcBD3Dc544178DC60',
  },
  {
    symbol: 'BAL_RETH_WETH_LP',
    address: BAL_RETH_WETH_LP,
    owner: '0x5f98718e4e0EFcb7B5551E2B2584E6781ceAd867',
  },
  {
    symbol: 'ETH_STETH_LP',
    address: ETH_STETH_LP,
    owner: '0x82a7E64cdCaEdc0220D0a4eB49fDc2Fe8230087A',
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
