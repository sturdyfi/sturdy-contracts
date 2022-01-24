import { task } from 'hardhat/config';
import { ConfigNames, loadPoolConfig } from '../../helpers/configuration';
import { deployMockyvWFTM } from '../../helpers/contracts-deployments';
import { getFirstSigner } from '../../helpers/contracts-getters';
import { getParamPerNetwork, verifyContract } from '../../helpers/contracts-helpers';
import { eNetwork, IFantomConfiguration } from '../../helpers/types';

task('sturdy:testnet:ftm:mockyvWFTM', 'Deploy dai token')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ verify }, DRE) => {
    await DRE.run('set-DRE');

    const poolConfig = loadPoolConfig(ConfigNames.Fantom) as IFantomConfiguration;
    const network = process.env.FORK ? <eNetwork>process.env.FORK : <eNetwork>DRE.network.name;
    const sender = await (await getFirstSigner()).getAddress();
    const wftmAddress = getParamPerNetwork(poolConfig.WETH, network);

    console.log('Deploying MockyvWFTM started\n');
    const yvWFTM = await deployMockyvWFTM(
      [wftmAddress, sender, sender, '', '', sender, sender],
      verify
    );
    console.log(`MockyvWFTM address `, yvWFTM.address);
  });
