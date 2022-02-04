import { parseEther } from 'ethers/lib/utils';
import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import {
  deployMockWBTCForFTM,
  deployMockWETHForFTM,
  deployMockyvWBTC,
  deployMockyvWETH,
  deployMockyvWFTM,
} from '../../helpers/contracts-deployments';
import { getFirstSigner, getMintableERC20, getSwapinERC20 } from '../../helpers/contracts-getters';
import {
  convertToCurrencyDecimals,
  getParamPerNetwork,
  verifyContract,
} from '../../helpers/contracts-helpers';
import { eNetwork, IFantomConfiguration } from '../../helpers/types';
import { DaiFactory } from '../../types';

task('sturdy:testnet:ftm:mockVaults', 'Deploy dai token')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ verify }, DRE) => {
    await DRE.run('set-DRE');

    const poolConfig = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>DRE.network.name;
    const sender = await (await getFirstSigner()).getAddress();
    const wftmAddress = getParamPerNetwork(poolConfig.WFTM, network);
    const wethAddress = getParamPerNetwork(poolConfig.WETH, network);
    const wbtcAddress = getParamPerNetwork(poolConfig.WBTC, network);

    console.log('Deploying MockyvWFTM started\n');
    const yvWFTM = await deployMockyvWFTM(
      [wftmAddress, sender, sender, '', '', sender, sender],
      verify
    );
    console.log(`MockyvWFTM address `, yvWFTM.address);

    console.log('Deploying MockyvWETH started\n');
    const yvWETH = await deployMockyvWETH(
      [wethAddress, sender, sender, '', '', sender, sender],
      verify
    );
    console.log(`MockyvWETH address `, yvWETH.address);

    console.log('Deploying MockyvWBTC started\n');
    const yvWBTC = await deployMockyvWBTC(
      [wbtcAddress, sender, sender, '', '', sender, sender],
      verify
    );
    console.log(`MockyvWBTC address `, yvWBTC.address);

    // console.log('Deploying MockWETH started\n');
    // const WETH = await deployMockWETHForFTM(
    //   ['Wrapped ETH', 'WETH', '18', sender],
    //   verify
    // );

    // await WETH.Swapin(
    //   "0x288f6dec7d6165b3513dbeafa36332f35b9946943ebb362c387cc7956dc16ec5",
    //   sender,
    //   parseEther('1000000')
    // );
    // console.log(`MockWETH address `, WETH.address);

    // console.log('Deploying MockWBTC started\n');
    // const WBTC = await deployMockWBTCForFTM(
    //   ['Wrapped BTC', 'WBTC', '8', sender],
    //   verify
    // );

    // await WBTC.Swapin(
    //   "0x288f6dec7d6165b3513dbeafa36332f35b9946943ebb362c387cc7956dc16ec5",
    //   sender,
    //   await convertToCurrencyDecimals(WBTC.address, '1000')
    // );
    // console.log(`MockWBTC address `, WBTC.address);

    // const usdc = await getSwapinERC20('0x8f785910e0cc96f854450DFb53be6492daff0b15');
    // await usdc.Swapin(
    //   "0x288f6dec7d6165b3513dbeafa36332f35b9946943ebb362c387cc7956dc16ec5",
    //   sender,
    //   await convertToCurrencyDecimals(usdc.address, '20000000')
    // );
    // const usdt = await getSwapinERC20('0x211554151F2f00305f33530Fdd3a5d0354927A65');
    // await usdt.Swapin(
    //   "0x288f6dec7d6165b3513dbeafa36332f35b9946943ebb362c387cc7956dc16ec5",
    //   sender,
    //   await convertToCurrencyDecimals(usdt.address, '20000000')
    // )
    // const weth = await getSwapinERC20('0x4135c251eE7804A73dB09D36C306AE0214deA28B');
    // await weth.Swapin(
    //   "0x288f6dec7d6165b3513dbeafa36332f35b9946943ebb362c387cc7956dc16ec5",
    //   sender,
    //   parseEther('20000000')
    // );
    // const dai = await DaiFactory.connect(
    //   '0x9440c3bB6Adb5F0D5b8A460d8a8c010690daC2E8',
    //   await getFirstSigner()
    // );
    // await dai.mint(
    //   sender,
    //   await convertToCurrencyDecimals(dai.address, '20000000')
    // );
  });
