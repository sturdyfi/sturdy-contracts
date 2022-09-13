import rawBRE from 'hardhat';
import {
  getEthersSigners,
} from '../../helpers/contracts-helpers';
import { initializeMakeSuite } from './helpers/make-suite';
import { Signer } from 'ethers';

const buildTestEnv = async (deployer: Signer, secondaryWallet: Signer) => {};

before(async () => {
  await rawBRE.run('set-DRE');
  const [deployer, secondaryWallet] = await getEthersSigners();
  const FORK = process.env.FORK;
  const SKIP_DEPLOY = process.env.SKIP_DEPLOY;

  if (!SKIP_DEPLOY) {
    if (FORK) {
      await rawBRE.run('sturdy:mainnet');
    } else {
      console.log('-> Deploying test environment...');
      await buildTestEnv(deployer, secondaryWallet);
    }
  }

  await initializeMakeSuite();
  console.log('\n***************');
  console.log('Setup and snapshot finished');
  console.log('***************\n');
});
