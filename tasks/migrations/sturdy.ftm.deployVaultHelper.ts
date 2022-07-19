import { sign } from 'crypto';
import { parseEther } from 'ethers/lib/utils';
import { task } from 'hardhat/config';
import { loadPoolConfig } from '../../helpers/configuration';
import {
  deployDAIUSDCUSDTSUSDOracle,
  deployFRAXUSDCOracle,
  deployIronBankOracle,
  deployMIM3CRVPOracle,
} from '../../helpers/contracts-deployments';
import {
  getATokensAndRatesHelper,
  getConvexDAIUSDCUSDTSUSDVault,
  getConvexFRAXUSDCVault,
  getConvexIronBankVault,
  getConvexMIM3CRVVault,
  getDeployVaultHelper,
  getLendingPool,
  getLendingPoolAddressesProvider,
  getSturdyIncentivesController,
  getSturdyOracle,
  getVariableYieldDistribution,
} from '../../helpers/contracts-getters';
import {
  getEthersSigners,
  getParamPerNetwork,
  insertContractAddressInDb,
} from '../../helpers/contracts-helpers';
import { getReserveConfigs } from '../../helpers/init-helpers';
import { impersonateAccountsHardhat, waitForTx } from '../../helpers/misc-utils';
import { eContractid, eNetwork } from '../../helpers/types';

task('sturdy:ftm:deployVaultHelper', 'Deploy vault')
  .addParam('pool', `Pool name to retrieve configuration`)
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ pool, verify }, DRE) => {
    await DRE.run('set-DRE');

    const network = process.env.FORK || DRE.network.name;
    const poolConfig = loadPoolConfig(pool);
    const { ReserveAssets, ChainlinkAggregator } = poolConfig;

    const vaultHelper = await getDeployVaultHelper();
    const aTokenHelper = await getATokensAndRatesHelper();
    const addressProvider = await getLendingPoolAddressesProvider();
    const _treasuryAddress = '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a';
    const _treasuryFee = 1000;
    const _aTokenHelper = aTokenHelper.address;

    const ethers = (DRE as any).ethers;
    const [_deployer] = await getEthersSigners();
    await _deployer.sendTransaction({
      value: parseEther('90000'),
      to: '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60',
    });
    await impersonateAccountsHardhat(['0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60']);
    let signer = await ethers.provider.getSigner('0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60'); //Owner

    // // transfer owner to vaule helper contract for deploying new vault
    // await waitForTx(await addressProvider.connect(signer).transferOwnership(vaultHelper.address));

    await waitForTx(await aTokenHelper.connect(signer).transferOwnership(vaultHelper.address));

    // // mooTOMB_MIMATIC reserve
    // {
    //   // Run deployVault using the above param
    //   // The following params are generated by running this command but only for forked mainnet, when deploy mainnet, need to change command including network
    //   // yarn hardhat external:get-param-for-new-vault --pool Fantom --symbol mooTOMB_MIMATIC --network ftm/ftm_test
    //   await waitForTx(
    //     await vaultHelper.deployVault(
    //       [
    //         '0x42454546595f544f4d425f4d494d415449435f5641554c540000000000000000',   // 'BEEFY_TOMB_MIMATIC_VAULT'
    //         '0x6d6f6f546f6d62544f4d422d4d494d4154494300000000000000000000000000',   // 'mooTombTOMB-MIMATIC'
    //         '0x544f4d425f4d494d415449435f4c500000000000000000000000000000000000',   // 'TOMB_MIMATIC_LP'
    //         '0x4d494d4154494300000000000000000000000000000000000000000000000000',   // 'MIMATIC'
    //         '0x5553444300000000000000000000000000000000000000000000000000000000',   // 'USDC'
    //         '0x746f6d6253776170526f75746572000000000000000000000000000000000000'    // 'tombSwapRouter'
    //       ],
    //       [
    //         '0xb2be5Cd33DBFf412Bce9587E44b5647a4BdA6a66',     // vault implement address (BEEFY_TOMB_MIMATIC_VAULT)
    //         '0xb2be5Cd33DBFf412Bce9587E44b5647a4BdA6a66',     // internal asset address (mooTombTOMB-MIMATIC)
    //         '0x45f4682B560d4e3B8FF1F1b3A38FDBe775C7177b',     // exterenal asset address (TOMB_MIMATIC_LP)
    //         '0xfB98B335551a418cD0737375a2ea0ded62Ea213b',     // MIMATIC address
    //         '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',     // USDC address
    //         '0x6D0176C5ea1e44b08D3dd001b0784cE42F47a3A7'      // TombSwapRouter address
    //       ],
    //       _treasuryAddress,
    //       _treasuryFee,
    //       _aTokenHelper,
    //       [
    //         {
    //           asset: '0xb2be5Cd33DBFf412Bce9587E44b5647a4BdA6a66',
    //           baseLTV: '0',
    //           liquidationThreshold: '7500',
    //           liquidationBonus: '10750',
    //           reserveFactor: '0',
    //           stableBorrowingEnabled: false,
    //           borrowingEnabled: false,
    //           collateralEnabled: true
    //         }
    //       ],
    //       [
    //         {
    //           aTokenImpl: '0x9787bDC2Ff7F39Ff981ecc347DfAcF6D57b8783E',
    //           stableDebtTokenImpl: '0x56045D514799074E474ee0AC9508162202f62d32',
    //           variableDebtTokenImpl: '0x95455A00338E046D6b1D180b46d8Bf3597258206',
    //           underlyingAssetDecimals: '18',
    //           interestRateStrategyAddress: rates.address,
    //           yieldAddress: '0x0000000000000000000000000000000000000000',
    //           underlyingAsset: '0xb2be5Cd33DBFf412Bce9587E44b5647a4BdA6a66',
    //           treasury: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    //           incentivesController: '0xcdA2B5Cd654be0DBA19E4064c583642741712560',
    //           underlyingAssetName: 'mooTOMB_MIMATIC',
    //           aTokenName: 'Sturdy interest bearing mooTOMB_MIMATIC',
    //           aTokenSymbol: 'smooTOMB_MIMATIC',
    //           variableDebtTokenName: 'Sturdy variable debt bearing mooTOMB_MIMATIC',
    //           variableDebtTokenSymbol: 'variableDebtmooTOMB_MIMATIC',
    //           stableDebtTokenName: 'Sturdy stable debt bearing mooTOMB_MIMATIC',
    //           stableDebtTokenSymbol: 'stableDebtmooTOMB_MIMATIC',
    //           params: '0x10'
    //         }
    //       ]
    //     )
    //   );

    //   // saving the newly created contract address
    //   const newVaultProxyAddress = await addressProvider.getAddress(
    //     '0x42454546595f544f4d425f4d494d415449435f5641554c540000000000000000'
    //   );
    //   await insertContractAddressInDb(eContractid.TombMiMaticBeefyVault, newVaultProxyAddress);
    // }

    // mooBASED_MIMATIC reserve
    // {
    //   // Run deployVault using the above param
    //   // The following params are generated by running this command but only for forked mainnet, when deploy mainnet, need to change command including network
    //   // yarn hardhat external:get-param-for-new-vault --pool Fantom --symbol mooBASED_MIMATIC --network ftm/ftm_test
    //   await waitForTx(
    //     await vaultHelper.deployVault(
    //       [
    //         '0x42454546595f42415345445f4d494d415449435f5641554c5400000000000000', // 'BEEFY_BASED_MIMATIC_VAULT'
    //         '0x6d6f6f546f6d6242415345442d4d494d41544943000000000000000000000000', // 'mooTombBASED-MIMATIC'
    //         '0x42415345445f4d494d415449435f4c5000000000000000000000000000000000', // 'BASED_MIMATIC_LP'
    //         '0x4241534544000000000000000000000000000000000000000000000000000000', // 'BASED'
    //       ],
    //       [
    //         '0x21d7D4B68b766Ff2508b53EBaa928b9CC581e506', // vault implement address (BEEFY_BASED_MIMATIC_VAULT)
    //         '0x316C7c7e783A1d91806A069cF91aA048FD4a86dC', // internal asset address (mooTombBASED-MIMATIC)
    //         '0x323b65bC4F76b36AB57EAF4cFBD9561cfaAe5d29', // exterenal asset address (BASED_MIMATIC_LP)
    //         '0xD5868d9D96eFD744f4b0579C74Abdb26697E9AB2', // BASED address
    //       ],
    //       _treasuryAddress,
    //       _treasuryFee,
    //       _aTokenHelper,
    //       [
    //         {
    //           asset: '0x316C7c7e783A1d91806A069cF91aA048FD4a86dC',
    //           baseLTV: '7000',
    //           liquidationThreshold: '7500',
    //           liquidationBonus: '10750',
    //           reserveFactor: '0',
    //           stableBorrowingEnabled: false,
    //           borrowingEnabled: false,
    //           collateralEnabled: true,
    //         },
    //       ],
    //       [
    //         {
    //           aTokenImpl: '0xbd6374566128fc1129e5f63fEEe73e8d8d1F84Eb',
    //           stableDebtTokenImpl: '0x6A0e35E60e3E79c38Bb88C384Ae17e9218ad9CD4',
    //           variableDebtTokenImpl: '0xcd9C4C8b1f3FEB11C261A65310c2eBe453Dd822A',
    //           underlyingAssetDecimals: '18',
    //           interestRateStrategyAddress: '0x007AAe40561ba9aBA3B2c2DA7D078CB8e16a1c13',
    //           yieldAddress: '0x0000000000000000000000000000000000000000',
    //           underlyingAsset: '0x316C7c7e783A1d91806A069cF91aA048FD4a86dC',
    //           treasury: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    //           incentivesController: '0xe8257438ea046A3f5f246c862Efd8c96AD82289a',
    //           underlyingAssetName: 'mooBASED_MIMATIC',
    //           aTokenName: 'Sturdy interest bearing mooBASED_MIMATIC',
    //           aTokenSymbol: 'smooBASED_MIMATIC',
    //           variableDebtTokenName: 'Sturdy variable debt bearing mooBASED_MIMATIC',
    //           variableDebtTokenSymbol: 'variableDebtmooBASED_MIMATIC',
    //           stableDebtTokenName: 'Sturdy stable debt bearing mooBASED_MIMATIC',
    //           stableDebtTokenSymbol: 'stableDebtmooBASED_MIMATIC',
    //           params: '0x10',
    //         },
    //       ]
    //     )
    //   );

    //   // saving the newly created contract address
    //   const newVaultProxyAddress = await addressProvider.getAddress(
    //     '0x42454546595f42415345445f4d494d415449435f5641554c5400000000000000'
    //   );
    //   await insertContractAddressInDb(eContractid.BasedMiMaticBeefyVault, newVaultProxyAddress);
    // }

    //================= Ethereum Vault ==================
    // // cvxMIM_3CRV reserve
    // {
    //   // First deploy vault via addressProvider on the defender app
    //   const provider = await getLendingPoolAddressesProvider();
    //   signer = await ethers.provider.getSigner('0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60'); //Owner
    //   await provider.connect(signer).setAddressAsProxy(
    //     '0x434f4e5645585f4d494d5f334352565f5641554c540000000000000000000000', // 'id: CONVEX_MIM_3CRV_VAULT'
    //     '0xce22EB8aB9C6bc8a6d756e80713B4008501D7bc7' // vault implement address (CONVEX_MIM_3CRV_VAULT)
    //   );

    //   // saving the newly created contract address
    //   const newVaultProxyAddress = await addressProvider.getAddress(
    //     '0x434f4e5645585f4d494d5f334352565f5641554c540000000000000000000000' // 'id: CONVEX_MIM_3CRV_VAULT'
    //   );
    //   await insertContractAddressInDb(eContractid.ConvexMIM3CRVVault, newVaultProxyAddress);

    //   // vault configuration
    //   const vault = await getConvexMIM3CRVVault();
    //   await vault
    //     .connect(signer)
    //     .setConfiguration(/*MIM_3CRV_LP*/ '0x5a6A4D54456819380173272A5E8E9B9904BdF41B', 40); // set curve lp token & convex pool id
    //   const internalAsset = await vault.getInternalAsset();
    //   await vault.connect(signer).setIncentiveRatio('7500');
    //   console.log('Internal Asset: ', internalAsset);

    //   // change the internal asset address in the configuration
    //   // index.ts

    //   // transfer owner to vaule helper contract for deploying new vault
    //   await waitForTx(await addressProvider.connect(signer).transferOwnership(vaultHelper.address));

    //   // Run deployVault using the above param
    //   // The following params are generated by running this command but only for forked mainnet, when deploy mainnet, need to change command including network
    //   // yarn hardhat external:get-param-for-new-vault --pool Sturdy --symbol cvxMIM_3CRV --network main

    //   signer = await ethers.provider.getSigner('0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc'); //Owner
    //   await waitForTx(
    //     await vaultHelper.connect(signer).deployVault(
    //       [
    //         '0x434f4e5645585f4d494d5f334352565f5641554c540000000000000000000000', // 'CONVEX_MIM_3CRV_VAULT'
    //         '0x435658465241585f334352560000000000000000000000000000000000000000', // 'CVXFRAX_3CRV'
    //         '0x4d494d5f334352565f4c50000000000000000000000000000000000000000000', // 'MIM_3CRV_LP'
    //       ],
    //       [
    //         '0xce22EB8aB9C6bc8a6d756e80713B4008501D7bc7', // vault implement address (CONVEX_MIM_3CRV_VAULT)
    //         internalAsset, // internal asset address (CVXFRAX_3CRV)
    //         '0x5a6A4D54456819380173272A5E8E9B9904BdF41B', // exterenal asset address (MIM_3CRV_LP)
    //       ],
    //       _treasuryAddress,
    //       _treasuryFee,
    //       _aTokenHelper,
    //       [
    //         {
    //           asset: internalAsset,
    //           baseLTV: '9000',
    //           liquidationThreshold: '9300',
    //           liquidationBonus: '10200',
    //           reserveFactor: '0',
    //           stableBorrowingEnabled: false,
    //           borrowingEnabled: false,
    //           collateralEnabled: true,
    //         },
    //       ],
    //       [
    //         {
    //           aTokenImpl: '0xc0b3799d31875cbAe5450528663A3D205d62Ac0F',
    //           stableDebtTokenImpl: '0x98A60C175fF02fC099383c6F6504a82aD8B85248',
    //           variableDebtTokenImpl: '0x6AdCd1C2a36eFbA34801384cc4A18f754A4de20E',
    //           underlyingAssetDecimals: '18',
    //           interestRateStrategyAddress: '0x84dcDE91a81FE6199641f5a11cC858dd90D2759C',
    //           yieldAddress: '0x0000000000000000000000000000000000000000',
    //           underlyingAsset: internalAsset,
    //           treasury: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    //           incentivesController: '0xA3e9B5e1dc6B24F296FfCF9c085E2546A466b883',
    //           underlyingAssetName: 'cvxMIM_3CRV',
    //           aTokenName: 'Sturdy interest bearing cvxMIM_3CRV',
    //           aTokenSymbol: 'scvxMIM_3CRV',
    //           variableDebtTokenName: 'Sturdy variable debt bearing cvxMIM_3CRV',
    //           variableDebtTokenSymbol: 'variableDebtcvxMIM_3CRV',
    //           stableDebtTokenName: 'Sturdy stable debt bearing cvxMIM_3CRV',
    //           stableDebtTokenSymbol: 'stableDebtcvxMIM_3CRV',
    //           params: '0x10',
    //         },
    //       ]
    //     )
    //   );

    //   // Deploy and Register new oracle for new vault
    //   let MIM3CRVOracleAddress = getParamPerNetwork(
    //     ChainlinkAggregator,
    //     <eNetwork>network
    //   ).cvxMIM_3CRV;
    //   if (!MIM3CRVOracleAddress) {
    //     const MIM3CRVOracle = await deployMIM3CRVPOracle(verify);
    //     MIM3CRVOracleAddress = MIM3CRVOracle.address;
    //   }
    //   const sturdyOracle = await getSturdyOracle();
    //   await waitForTx(
    //     await sturdyOracle
    //       .connect(signer)
    //       .setAssetSources(
    //         [internalAsset],
    //         [MIM3CRVOracleAddress]
    //       )
    //   );

    //   // update the oracle configuration
    //   // common.ts

    //   //CRV VariableYieldDistributor config
    //   const lendingPool = await getLendingPool();
    //   const response = await lendingPool.getReserveData(internalAsset);
    //   const VariableYieldDistributor = await getVariableYieldDistribution();
    //   await VariableYieldDistributor.connect(signer).registerAsset(
    //     response.aTokenAddress,
    //     newVaultProxyAddress
    //   );
    //   const reserveConfigs = getReserveConfigs(pool);
    //   const strategyParams = reserveConfigs['strategyCVXMIM_3CRV'];
    //   const incentivesController = await getSturdyIncentivesController();
    //   await incentivesController.configureAssets(
    //     [response.aTokenAddress, response.variableDebtTokenAddress],
    //     [strategyParams.emissionPerSecond, strategyParams.emissionPerSecond]
    //   );
    // }

    // // cvxDAI_USDC_USDT_SUSD reserve
    // {
    //   // First deploy vault via addressProvider on the defender app
    //   const provider = await getLendingPoolAddressesProvider();
    //   signer = await ethers.provider.getSigner('0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60'); //Owner
    //   await provider.connect(signer).setAddressAsProxy(
    //     '0x434f4e5645585f4441495f555344435f555344545f535553445f5641554c5400', // 'id: CONVEX_DAI_USDC_USDT_SUSD_VAULT'
    //     '0x68d74ab0A28Ab3A4E04b6538CEd7cb2BDC3db541' // vault implement address (CONVEX_DAI_USDC_USDT_SUSD_VAULT)
    //   );

    //   // saving the newly created contract address
    //   const newVaultProxyAddress = await addressProvider.getAddress(
    //     '0x434f4e5645585f4441495f555344435f555344545f535553445f5641554c5400' // 'id: CONVEX_DAI_USDC_USDT_SUSD_VAULT'
    //   );
    //   await insertContractAddressInDb(eContractid.ConvexDAIUSDCUSDTSUSDVault, newVaultProxyAddress);

    //   // vault configuration
    //   const vault = await getConvexDAIUSDCUSDTSUSDVault();
    //   await vault
    //     .connect(signer)
    //     .setConfiguration(
    //       /*DAI_USDC_USDT_SUSD_LP*/ '0xC25a3A3b969415c80451098fa907EC722572917F',
    //       4
    //     ); // set curve lp token & convex pool id
    //   await vault.connect(signer).setIncentiveRatio('7500');
    //   const internalAsset = await vault.getInternalAsset();
    //   console.log('Internal Asset: ', internalAsset);

    //   // change the internal asset address in the configuration
    //   // index.ts

    //   // transfer owner to vaule helper contract for deploying new vault
    //   await waitForTx(await addressProvider.connect(signer).transferOwnership(vaultHelper.address));

    //   // Run deployVault using the above param
    //   // The following params are generated by running this command but only for forked mainnet, when deploy mainnet, need to change command including network
    //   // yarn hardhat external:get-param-for-new-vault --pool Sturdy --symbol cvxDAI_USDC_USDT_SUSD --network main

    //   signer = await ethers.provider.getSigner('0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc'); //Owner
    //   await waitForTx(
    //     await vaultHelper.connect(signer).deployVault(
    //       [
    //         '0x434f4e5645585f4441495f555344435f555344545f535553445f5641554c5400', // 'CONVEX_DAI_USDC_USDT_SUSD_VAULT'
    //         '0x4356584441495f555344435f555344545f535553440000000000000000000000', // 'CVXDAI_USDC_USDT_SUSD'
    //         '0x4441495f555344435f555344545f535553445f4c500000000000000000000000', // 'DAI_USDC_USDT_SUSD_LP'
    //       ],
    //       [
    //         '0x68d74ab0A28Ab3A4E04b6538CEd7cb2BDC3db541', // vault implement address (CONVEX_DAI_USDC_USDT_SUSD_VAULT)
    //         internalAsset, // internal asset address (CVXDAI_USDC_USDT_SUSD)
    //         '0xC25a3A3b969415c80451098fa907EC722572917F', // exterenal asset address (DAI_USDC_USDT_SUSD_LP)
    //       ],
    //       _treasuryAddress,
    //       _treasuryFee,
    //       _aTokenHelper,
    //       [
    //         {
    //           asset: internalAsset,
    //           baseLTV: '9000',
    //           liquidationThreshold: '9300',
    //           liquidationBonus: '10200',
    //           reserveFactor: '0',
    //           stableBorrowingEnabled: false,
    //           borrowingEnabled: false,
    //           collateralEnabled: true,
    //         },
    //       ],
    //       [
    //         {
    //           aTokenImpl: '0xc0b3799d31875cbAe5450528663A3D205d62Ac0F',
    //           stableDebtTokenImpl: '0x98A60C175fF02fC099383c6F6504a82aD8B85248',
    //           variableDebtTokenImpl: '0x6AdCd1C2a36eFbA34801384cc4A18f754A4de20E',
    //           underlyingAssetDecimals: '18',
    //           interestRateStrategyAddress: '0xE0E62dDEb16De3dD87aE5F42428AD22308CBCc16',
    //           yieldAddress: '0x0000000000000000000000000000000000000000',
    //           underlyingAsset: internalAsset,
    //           treasury: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    //           incentivesController: '0xA3e9B5e1dc6B24F296FfCF9c085E2546A466b883',
    //           underlyingAssetName: 'cvxDAI_USDC_USDT_SUSD',
    //           aTokenName: 'Sturdy interest bearing cvxDAI_USDC_USDT_SUSD',
    //           aTokenSymbol: 'scvxDAI_USDC_USDT_SUSD',
    //           variableDebtTokenName: 'Sturdy variable debt bearing cvxDAI_USDC_USDT_SUSD',
    //           variableDebtTokenSymbol: 'variableDebtcvxDAI_USDC_USDT_SUSD',
    //           stableDebtTokenName: 'Sturdy stable debt bearing cvxDAI_USDC_USDT_SUSD',
    //           stableDebtTokenSymbol: 'stableDebtcvxDAI_USDC_USDT_SUSD',
    //           params: '0x10',
    //         },
    //       ]
    //     )
    //   );

    //   // Deploy DAIUSDCUSDTSUSD oracle
    //   let DAIUSDCUSDTSUSDOracleAddress = getParamPerNetwork(
    //     ChainlinkAggregator,
    //     <eNetwork>network
    //   ).cvxDAI_USDC_USDT_SUSD;
    //   if (!DAIUSDCUSDTSUSDOracleAddress) {
    //     const DAIUSDCUSDTSUSDOracle = await deployDAIUSDCUSDTSUSDOracle(verify);
    //     DAIUSDCUSDTSUSDOracleAddress = DAIUSDCUSDTSUSDOracle.address;
    //   }
    //   const sturdyOracle = await getSturdyOracle();
    //   await waitForTx(
    //     await sturdyOracle
    //       .connect(signer)
    //       .setAssetSources([internalAsset], [DAIUSDCUSDTSUSDOracleAddress])
    //   );

    //   // update the oracle configuration
    //   // common.ts

    //   //CRV VariableYieldDistributor config
    //   const lendingPool = await getLendingPool();
    //   const response = await lendingPool.getReserveData(internalAsset);
    //   const VariableYieldDistributor = await getVariableYieldDistribution();
    //   await VariableYieldDistributor.connect(signer).registerAsset(
    //     response.aTokenAddress,
    //     newVaultProxyAddress
    //   );
    //   const reserveConfigs = getReserveConfigs(pool);
    //   const strategyParams = reserveConfigs['strategyCVXDAI_USDC_USDT_SUSD'];
    //   const incentivesController = await getSturdyIncentivesController();
    //   await incentivesController.configureAssets(
    //     [response.aTokenAddress, response.variableDebtTokenAddress],
    //     [strategyParams.emissionPerSecond, strategyParams.emissionPerSecond]
    //   );
    // }

    // // cvxIRON_BANK reserve
    // {
    //   // First deploy vault via addressProvider on the defender app
    //   const provider = await getLendingPoolAddressesProvider();
    //   signer = await ethers.provider.getSigner('0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60'); //Owner
    //   await provider.connect(signer).setAddressAsProxy(
    //     '0x434f4e5645585f49524f4e5f42414e4b5f5641554c5400000000000000000000', // 'id: CONVEX_IRON_BANK_VAULT'
    //     '0xA004DF37c84a43FEB90142e209430649F4025EB3' // vault implement address (CONVEX_IRON_BANK_VAULT)
    //   );

    //   // saving the newly created contract address
    //   const newVaultProxyAddress = await addressProvider.getAddress(
    //     '0x434f4e5645585f49524f4e5f42414e4b5f5641554c5400000000000000000000' // 'id: CONVEX_IRON_BANK_VAULT'
    //   );
    //   await insertContractAddressInDb(eContractid.ConvexIronBankVault, newVaultProxyAddress);

    //   // vault configuration
    //   const vault = await getConvexIronBankVault();
    //   await vault
    //     .connect(signer)
    //     .setConfiguration(/*IRON_BANK_LP*/ '0x5282a4eF67D9C33135340fB3289cc1711c13638C', 29); // set curve lp token & convex pool id
    //   await vault.connect(signer).setIncentiveRatio('4000');

    //   const internalAsset = await vault.getInternalAsset();
    //   console.log('Internal Asset: ', internalAsset);

    //   // change the internal asset address in the configuration
    //   // index.ts

    //   // transfer owner to vaule helper contract for deploying new vault
    //   await waitForTx(await addressProvider.connect(signer).transferOwnership(vaultHelper.address));

    //   // Run deployVault using the above param
    //   // The following params are generated by running this command but only for forked mainnet, when deploy mainnet, need to change command including network
    //   // yarn hardhat external:get-param-for-new-vault --pool Sturdy --symbol cvxIRON_BANK --network main

    //   await waitForTx(
    //     await vaultHelper.connect(signer).deployVault(
    //       [
    //         '0x434f4e5645585f49524f4e5f42414e4b5f5641554c5400000000000000000000', // 'CONVEX_IRON_BANK_VAULT'
    //         '0x43565849524f4e5f42414e4b0000000000000000000000000000000000000000', // 'CVXIRON_BANK'
    //         '0x49524f4e5f42414e4b5f4c500000000000000000000000000000000000000000', // 'IRON_BANK_LP'
    //       ],
    //       [
    //         '0xA004DF37c84a43FEB90142e209430649F4025EB3', // vault implement address (CONVEX_IRON_BANK_VAULT)
    //         internalAsset, // internal asset address (CVXIRON_BANK)
    //         '0x5282a4eF67D9C33135340fB3289cc1711c13638C', // exterenal asset address (IRON_BANK_LP)
    //       ],
    //       _treasuryAddress,
    //       _treasuryFee,
    //       _aTokenHelper,
    //       [
    //         {
    //           asset: internalAsset,
    //           baseLTV: '9000',
    //           liquidationThreshold: '9300',
    //           liquidationBonus: '10200',
    //           reserveFactor: '0',
    //           stableBorrowingEnabled: false,
    //           borrowingEnabled: false,
    //           collateralEnabled: true,
    //         },
    //       ],
    //       [
    //         {
    //           aTokenImpl: '0xc0b3799d31875cbAe5450528663A3D205d62Ac0F',
    //           stableDebtTokenImpl: '0x98A60C175fF02fC099383c6F6504a82aD8B85248',
    //           variableDebtTokenImpl: '0x6AdCd1C2a36eFbA34801384cc4A18f754A4de20E',
    //           underlyingAssetDecimals: '18',
    //           interestRateStrategyAddress: '0xaE9dfa3beAF1CFB5cAf41B87C0cdC389D62e7105',
    //           yieldAddress: '0x0000000000000000000000000000000000000000',
    //           underlyingAsset: internalAsset,
    //           treasury: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    //           incentivesController: '0xA3e9B5e1dc6B24F296FfCF9c085E2546A466b883',
    //           underlyingAssetName: 'cvxIRON_BANK',
    //           aTokenName: 'Sturdy interest bearing cvxIRON_BANK',
    //           aTokenSymbol: 'scvxIRON_BANK',
    //           variableDebtTokenName: 'Sturdy variable debt bearing cvxIRON_BANK',
    //           variableDebtTokenSymbol: 'variableDebtcvxIRON_BANK',
    //           stableDebtTokenName: 'Sturdy stable debt bearing cvxIRON_BANK',
    //           stableDebtTokenSymbol: 'stableDebtcvxIRON_BANK',
    //           params: '0x10',
    //         },
    //       ]
    //     )
    //   );

    //   // Deploy IronBank oracle
    //   let IronBankOracleAddress = getParamPerNetwork(
    //     ChainlinkAggregator,
    //     <eNetwork>network
    //   ).cvxIRON_BANK;
    //   if (!IronBankOracleAddress) {
    //     const IronBankOracle = await deployIronBankOracle(verify);
    //     IronBankOracleAddress = IronBankOracle.address;
    //   }
    //   const sturdyOracle = await getSturdyOracle();
    //   await impersonateAccountsHardhat(['0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc']);
    //   signer = await ethers.provider.getSigner('0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc'); //Owner
    //   await waitForTx(
    //     await sturdyOracle.connect(signer).setAssetSources([internalAsset], [IronBankOracleAddress])
    //   );

    //   // update the oracle configuration
    //   // common.ts

    //   //CRV VariableYieldDistributor config
    //   const lendingPool = await getLendingPool();
    //   const response = await lendingPool.getReserveData(internalAsset);
    //   const VariableYieldDistributor = await getVariableYieldDistribution();
    //   await VariableYieldDistributor.connect(signer).registerAsset(
    //     response.aTokenAddress,
    //     newVaultProxyAddress
    //   );
    //   const reserveConfigs = getReserveConfigs(pool);
    //   const strategyParams = reserveConfigs['strategyCVXIRON_BANK'];
    //   const incentivesController = await getSturdyIncentivesController();
    //   await incentivesController.configureAssets(
    //     [response.aTokenAddress, response.variableDebtTokenAddress],
    //     [strategyParams.emissionPerSecond, strategyParams.emissionPerSecond]
    //   );
    // }

    // // cvxFRAX_USDC reserve
    // {
    //   // First deploy vault via addressProvider on the defender app
    //   const provider = await getLendingPoolAddressesProvider();
    //   signer = await ethers.provider.getSigner('0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60'); //Owner
    //   await provider.connect(signer).setAddressAsProxy(
    //     '0x434f4e5645585f465241585f555344435f5641554c5400000000000000000000', // 'id: CONVEX_FRAX_USDC_VAULT'
    //     '0x8dA78b4CA9C961791840226849bf6015D427cF95' // vault implement address (CONVEX_FRAX_USDC_VAULT)
    //   );

    //   // saving the newly created contract address
    //   const newVaultProxyAddress = await addressProvider.getAddress(
    //     '0x434f4e5645585f465241585f555344435f5641554c5400000000000000000000' // 'id: CONVEX_FRAX_USDC_VAULT'
    //   );
    //   await insertContractAddressInDb(eContractid.ConvexFRAXUSDCVault, newVaultProxyAddress);

    //   // vault configuration
    //   const vault = await getConvexFRAXUSDCVault();
    //   await vault
    //     .connect(signer)
    //     .setConfiguration(/*FRAX_USDC_LP*/ '0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC', 100); // set curve lp token & convex pool id
    //   await vault.connect(signer).setIncentiveRatio('5000');

    //   const internalAsset = await vault.getInternalAsset();
    //   console.log('Internal Asset: ', internalAsset);

    //   // change the internal asset address in the configuration
    //   // index.ts

    //   // transfer owner to vaule helper contract for deploying new vault
    //   await waitForTx(await addressProvider.connect(signer).transferOwnership(vaultHelper.address));

    //   // Run deployVault using the above param
    //   // The following params are generated by running this command but only for forked mainnet, when deploy mainnet, need to change command including network
    //   // yarn hardhat external:get-param-for-new-vault --pool Sturdy --symbol cvxIRON_BANK --network main

    //   await waitForTx(
    //     await vaultHelper.connect(signer).deployVault(
    //       [
    //         '0x434f4e5645585f465241585f555344435f5641554c5400000000000000000000', // 'CONVEX_FRAX_USDC_VAULT'
    //         '0x435658465241585f555344430000000000000000000000000000000000000000', // 'CVXFRAX_USDC'
    //         '0x465241585f555344435f4c500000000000000000000000000000000000000000', // 'FRAX_USDC_LP'
    //       ],
    //       [
    //         '0x8dA78b4CA9C961791840226849bf6015D427cF95', // vault implement address (CONVEX_FRAX_USDC_VAULT)
    //         internalAsset, // internal asset address (CVXFRAX_USDC)
    //         '0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC', // exterenal asset address (FRAX_USDC_LP)
    //       ],
    //       _treasuryAddress,
    //       _treasuryFee,
    //       _aTokenHelper,
    //       [
    //         {
    //           asset: internalAsset,
    //           baseLTV: '9000',
    //           liquidationThreshold: '9300',
    //           liquidationBonus: '10200',
    //           reserveFactor: '0',
    //           stableBorrowingEnabled: false,
    //           borrowingEnabled: false,
    //           collateralEnabled: true,
    //         },
    //       ],
    //       [
    //         {
    //           aTokenImpl: '0xc0b3799d31875cbAe5450528663A3D205d62Ac0F',
    //           stableDebtTokenImpl: '0x98A60C175fF02fC099383c6F6504a82aD8B85248',
    //           variableDebtTokenImpl: '0x6AdCd1C2a36eFbA34801384cc4A18f754A4de20E',
    //           underlyingAssetDecimals: '18',
    //           interestRateStrategyAddress: '0x3E233E6F1C6709Be546Ee2Ef10bAFCe59819577a',
    //           yieldAddress: '0x0000000000000000000000000000000000000000',
    //           underlyingAsset: internalAsset,
    //           treasury: '0xFd1D36995d76c0F75bbe4637C84C06E4A68bBB3a',
    //           incentivesController: '0xA3e9B5e1dc6B24F296FfCF9c085E2546A466b883',
    //           underlyingAssetName: 'cvxFRAX_USDC',
    //           aTokenName: 'Sturdy interest bearing cvxFRAX_USDC',
    //           aTokenSymbol: 'scvxFRAX_USDC',
    //           variableDebtTokenName: 'Sturdy variable debt bearing cvxFRAX_USDC',
    //           variableDebtTokenSymbol: 'variableDebtcvxFRAX_USDC',
    //           stableDebtTokenName: 'Sturdy stable debt bearing cvxFRAX_USDC',
    //           stableDebtTokenSymbol: 'stableDebtcvxFRAX_USDC',
    //           params: '0x10',
    //         },
    //       ]
    //     )
    //   );

    //   // Deploy FRAXUSDC oracle
    //   let FRAXUSDCOracleAddress = getParamPerNetwork(
    //     ChainlinkAggregator,
    //     <eNetwork>network
    //   ).cvxFRAX_USDC;
    //   if (!FRAXUSDCOracleAddress) {
    //     const FRAXUSDCOracle = await deployFRAXUSDCOracle(verify);
    //     FRAXUSDCOracleAddress = FRAXUSDCOracle.address;
    //   }
    //   const sturdyOracle = await getSturdyOracle();
    //   await impersonateAccountsHardhat(['0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc']);
    //   signer = await ethers.provider.getSigner('0x48Cc0719E3bF9561D861CB98E863fdA0CEB07Dbc'); //Owner
    //   await waitForTx(
    //     await sturdyOracle.connect(signer).setAssetSources([internalAsset], [FRAXUSDCOracleAddress])
    //   );

    //   // update the oracle configuration
    //   // common.ts

    //   //CRV VariableYieldDistributor config
    //   const lendingPool = await getLendingPool();
    //   const response = await lendingPool.getReserveData(internalAsset);
    //   const VariableYieldDistributor = await getVariableYieldDistribution();
    //   await VariableYieldDistributor.connect(signer).registerAsset(
    //     response.aTokenAddress,
    //     newVaultProxyAddress
    //   );
    //   const reserveConfigs = getReserveConfigs(pool);
    //   const strategyParams = reserveConfigs['strategyCVXFRAX_USDC'];
    //   const incentivesController = await getSturdyIncentivesController();
    //   await incentivesController.configureAssets(
    //     [response.aTokenAddress, response.variableDebtTokenAddress],
    //     [strategyParams.emissionPerSecond, strategyParams.emissionPerSecond]
    //   );
    // }

    console.log(await addressProvider.owner());
    console.log(await aTokenHelper.owner());
  });
