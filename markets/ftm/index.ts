import { eFantomNetwork, IFantomConfiguration } from '../../helpers/types';

import { CommonsConfig } from './commons';
import {
  strategyDAI,
  strategyUSDC,
  strategyUSDT,
  strategyYVWFTM,
  // strategyMOOWETH,
  strategyYVWETH,
  strategyYVWBTC,
  strategyYVBOO,
  strategyMOOTOMB_FTM,
} from './reservesConfigs';

// ----------------
// POOL--SPECIFIC PARAMS
// ----------------

// noinspection SpellCheckingInspection
export const FantomConfig: IFantomConfiguration = {
  ...CommonsConfig,
  MarketId: 'Fantom market',
  ProviderId: 2,
  ReservesConfig: {
    DAI: strategyDAI,
    USDC: strategyUSDC,
    fUSDT: strategyUSDT,
    yvWFTM: strategyYVWFTM,
    // mooWETH: strategyMOOWETH,
    yvWETH: strategyYVWETH,
    yvWBTC: strategyYVWBTC,
    yvBOO: strategyYVBOO,
    mooTOMB_FTM: strategyMOOTOMB_FTM,
  },
  ReserveAssets: {
    [eFantomNetwork.ftm]: {
      DAI: '0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E',
      USDC: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
      fUSDT: '0x049d68029688eAbF473097a2fC38ef61633A3C7A',
      yvWFTM: '0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0',
      // mooWETH: '0x0a03D2C1cFcA48075992d810cc69Bd9FE026384a',
      yvWETH: '0xCe2Fc0bDc18BD6a4d9A725791A3DEe33F3a23BB7',
      yvWBTC: '0xd817A100AB8A29fE3DBd925c2EB489D67F758DA9',
      yvBOO: '0x0fBbf9848D969776a5Eb842EdAfAf29ef4467698',
      mooTOMB_FTM: '0x27c77411074ba90cA35e6f92A79dAd577c05A746'
    },
    [eFantomNetwork.ftm_test]: {
      DAI: '0x9440c3bB6Adb5F0D5b8A460d8a8c010690daC2E8',
      USDC: '0x8f785910e0cc96f854450DFb53be6492daff0b15',
      fUSDT: '0x211554151F2f00305f33530Fdd3a5d0354927A65',
      yvWFTM: '0x5a18d89Ad063C1AEd5B3c30741333c1a1116CFE3',
      yvWETH: '0x5F37179e6714D137C6A196eAd40d79005c5e9A61',
      yvWBTC: '0xf0074B10f63c7002A2254e8E310c60D72b13Ed91',
      yvBOO: '0x62aaa32a0AD45BE19ca418aC9e0CE9dB01d6A272',
      mooTOMB_FTM: '0x6Ea737e951c0079A0F4a38DFebe8B9Db7f29d17d'
    },
    [eFantomNetwork.tenderlyFTM]: {
      DAI: '0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E',
      USDC: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
      yvWFTM: '0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0',
      // mooWETH: '0x0a03D2C1cFcA48075992d810cc69Bd9FE026384a',
      fUSDT: '0x049d68029688eAbF473097a2fC38ef61633A3C7A',
      yvWETH: '0xCe2Fc0bDc18BD6a4d9A725791A3DEe33F3a23BB7',
      yvWBTC: '0xd817A100AB8A29fE3DBd925c2EB489D67F758DA9',
      yvBOO: '0x0fBbf9848D969776a5Eb842EdAfAf29ef4467698',
      mooTOMB_FTM: '0x27c77411074ba90cA35e6f92A79dAd577c05A746'
    },
  },
  BOO: {
    [eFantomNetwork.ftm]: '0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE',
    [eFantomNetwork.ftm_test]: '0x9dAFB108f0fFd18C1f844C4782F8c7F934f8566E',
    [eFantomNetwork.tenderlyFTM]: '0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE',
  },
  TOMB: {
    [eFantomNetwork.ftm]: '0x6c021Ae822BEa943b2E66552bDe1D2696a53fbB7',
    [eFantomNetwork.ftm_test]: '0x81b1E83538Adaa4164156ED43b8081aA97eD197D',
    [eFantomNetwork.tenderlyFTM]: '0x6c021Ae822BEa943b2E66552bDe1D2696a53fbB7',
  },
  TOMB_FTM_LP: {
    [eFantomNetwork.ftm]: '0x2A651563C9d3Af67aE0388a5c8F89b867038089e',
    [eFantomNetwork.ftm_test]: '0x0906E97beB6f422C239627FeFB9198144904327d',
    [eFantomNetwork.tenderlyFTM]: '0x2A651563C9d3Af67aE0388a5c8F89b867038089e',
  },
  YearnVaultFTM: {
    [eFantomNetwork.ftm]: '0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0',
    [eFantomNetwork.ftm_test]: '0x5a18d89Ad063C1AEd5B3c30741333c1a1116CFE3',
    [eFantomNetwork.tenderlyFTM]: '0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0',
  },
  YearnWETHVaultFTM: {
    [eFantomNetwork.ftm]: '0xCe2Fc0bDc18BD6a4d9A725791A3DEe33F3a23BB7',
    [eFantomNetwork.ftm_test]: '0x5F37179e6714D137C6A196eAd40d79005c5e9A61',
    [eFantomNetwork.tenderlyFTM]: '0xCe2Fc0bDc18BD6a4d9A725791A3DEe33F3a23BB7',
  },
  YearnWBTCVaultFTM: {
    [eFantomNetwork.ftm]: '0xd817A100AB8A29fE3DBd925c2EB489D67F758DA9',
    [eFantomNetwork.ftm_test]: '0xf0074B10f63c7002A2254e8E310c60D72b13Ed91',
    [eFantomNetwork.tenderlyFTM]: '0xd817A100AB8A29fE3DBd925c2EB489D67F758DA9',
  },
  YearnBOOVaultFTM: {
    [eFantomNetwork.ftm]: '0x0fBbf9848D969776a5Eb842EdAfAf29ef4467698',
    [eFantomNetwork.ftm_test]: '0x62aaa32a0AD45BE19ca418aC9e0CE9dB01d6A272',
    [eFantomNetwork.tenderlyFTM]: '0x0fBbf9848D969776a5Eb842EdAfAf29ef4467698',
  },
  BeefyVaultTOMB_FTM: {
    [eFantomNetwork.ftm]: '0x27c77411074ba90cA35e6f92A79dAd577c05A746',
    [eFantomNetwork.ftm_test]: '0x6Ea737e951c0079A0F4a38DFebe8B9Db7f29d17d',
    [eFantomNetwork.tenderlyFTM]: '0x27c77411074ba90cA35e6f92A79dAd577c05A746',
  },
  // BeefyVaultFTM: {
  //   [eFantomNetwork.ftm]: '0x0a03D2C1cFcA48075992d810cc69Bd9FE026384a',
  //   [eFantomNetwork.ftm_test]: '0x0a03D2C1cFcA48075992d810cc69Bd9FE026384a',
  //   [eFantomNetwork.tenderlyFTM]: '0x0a03D2C1cFcA48075992d810cc69Bd9FE026384a',
  // },
  UniswapRouter: {
    [eFantomNetwork.ftm]: '0xF491e7B69E4244ad4002BC14e878a34207E38c29',
    [eFantomNetwork.ftm_test]: '0xcCAFCf876caB8f9542d6972f87B5D62e1182767d',
    [eFantomNetwork.tenderlyFTM]: '0xF491e7B69E4244ad4002BC14e878a34207E38c29',
  },
};

export default FantomConfig;
