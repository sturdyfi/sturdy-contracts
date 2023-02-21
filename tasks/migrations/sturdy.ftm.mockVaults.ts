import BigNumber from 'bignumber.js';
import { parseEther } from 'ethers/lib/utils';
import { task } from 'hardhat/config';
import { oneEther, oneRay, ZERO_ADDRESS } from '../../helpers/constants';
import { deployDefaultReserveInterestRateStrategy } from '../../helpers/contracts-deployments';
import {
  getAToken,
  getFirstSigner,
  getLendingPoolAddressesProvider,
  getLendingPoolConfiguratorProxy,
  getLeverageSwapManager,
} from '../../helpers/contracts-getters';
import { impersonateAccountsHardhat } from '../../helpers/misc-utils';
import { eNetwork } from '../../helpers/types';

task('sturdy:testnet:ftm:mockVaults', 'Deploy dai token')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ verify }, DRE) => {
    await DRE.run('set-DRE');
    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>DRE.network.name;
    const sender = await (await getFirstSigner()).getAddress();

    // const deployerAddress = '0xDB478114EB8301A7acE35513c3312C1EEB8D99d0';
    // const ethers = (DRE as any).ethers;
    // await impersonateAccountsHardhat([deployerAddress]);
    // let signer = await ethers.provider.getSigner(deployerAddress);

    // const aCVXFRAX_USDC = await getAToken('0x62FBF417978259a67a362aB603e09bC8795159E6');
    // const abalance = await aCVXFRAX_USDC.balanceOf(deployerAddress);

    // const swapManager = await getLeverageSwapManager();
    // const fraxusdcSwapper = await GeneralLevSwapFactory.connect(await swapManager.getLevSwapper('0x27403B2756E9c2f436FB13e0B188Dd231F1da170'), signer);
    // await aCVXFRAX_USDC
    //     .connect(signer)
    //     .approve(fraxusdcSwapper.address, abalance.mul(2));
    // await fraxusdcSwapper.leavePosition(parseEther('30000'), 100, 12, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0x62FBF417978259a67a362aB603e09bC8795159E6', {gasLimit: 12450000});
    // await fraxusdcSwapper.leavePositionWithFlashloan(parseEther('30000'), 200, 100, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0x62FBF417978259a67a362aB603e09bC8795159E6')

    // // Frozen vault on testnet: TOMB_MIMATIC_LP, TOMB_FTM_LP
    // const configurator = await getLendingPoolConfiguratorProxy();
    // await configurator.freezeReserve('0x53F26e11497A3632CC58F88957C1761925f753B0');

    // const addressProvider = await getLendingPoolAddressesProvider();
    // await deployDefaultReserveInterestRateStrategy([
    //     addressProvider.address,
    //     new BigNumber(0.45).multipliedBy(oneRay).toFixed(),
    //     '0',
    //     '0',
    //     '0',
    //     '0',
    //     '0',
    //     new BigNumber(500).multipliedBy(oneEther).toFixed(),
    //   ],
    //   verify
    // );
  });
