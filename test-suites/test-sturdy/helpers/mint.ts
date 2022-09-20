import BigNumber from 'bignumber.js';
import { getMintableERC20 } from '../../../helpers/contracts-getters';
import { DRE, impersonateAccountsHardhat, waitForTx } from '../../../helpers/misc-utils';
import { SignerWithAddress } from './make-suite';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

// Curve LP Tokens
const FRAX_3CRV_LP = '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B';
const DAI_USDC_USDT_SUSD_LP = '0xC25a3A3b969415c80451098fa907EC722572917F';
const FRAX_USDC_LP = '0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC';
const IRON_BANK_LP = '0x5282a4eF67D9C33135340fB3289cc1711c13638C';
const MIM_3CRV_LP = '0x5a6A4D54456819380173272A5E8E9B9904BdF41B';

const TOKEN_INFO: {
  symbol: string;
  address: string;
  owner: string;
}[] = [
  {
    symbol: 'DAI',
    address: DAI,
    owner: '0x5d38b4e4783e34e2301a2a36c39a03c45798c4dd',
  },
  {
    symbol: 'USDC',
    address: USDC,
    owner: '0x72a53cdbbcc1b9efa39c834a540550e23463aacb',
  },
  {
    symbol: 'USDT',
    address: USDT,
    owner: '0x5a52e96bacdabb82fd05763e25335261b270efcb',
  },
  {
    symbol: 'FRAX_3CRV_LP',
    address: FRAX_3CRV_LP,
    owner: '0xb38c0ffd01ed7c02cf476c639cc07f88babb328b',
  },
  {
    symbol: 'DAI_USDC_USDT_SUSD_LP',
    address: DAI_USDC_USDT_SUSD_LP,
    owner: '0x1f9bB27d0C66fEB932f3F8B02620A128d072f3d8',
  },
  {
    symbol: 'FRAX_USDC_LP',
    address: FRAX_USDC_LP,
    owner: '0xF28E1B06E00e8774C612e31aB3Ac35d5a720085f',
  },
  {
    symbol: 'IRON_BANK_LP',
    address: IRON_BANK_LP,
    owner: '0xd4dfbde97c93e56d1e41325bb428c18299db203f',
  },
  {
    symbol: 'MIM_3CRV_LP',
    address: MIM_3CRV_LP,
    owner: '0xe896e539e557BC751860a7763C8dD589aF1698Ce',
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
