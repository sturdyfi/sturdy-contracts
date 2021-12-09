// Deposit 10 stETH tokens to your local wallet
const hardhat = require("hardhat");
const impersonateAddress = "0xeb9ab260eda599502e536181aaa3a5097406e498"; // for stETH
await hardhat.network.provider.send("hardhat_stopImpersonatingAccount", [
  impersonateAddress,
]);
await hardhat.network.provider.send("hardhat_impersonateAccount", [
  impersonateAddress,
]);
signer = await hardhat.ethers.provider.getSigner(impersonateAddress)
(await signer.getBalance()).toString();

const stETHAddress = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84";
const yourWalletAddress = "0xb4124cEB3451635DAcedd11767f004d8a28c6eE7";
const stETHAmount = "10"; // 10 tokens

const stEthAbi = [
  // Some details about the token
  "function name() view returns (string)",
  "function symbol() view returns (string)",

  // Get the account balance
  "function balanceOf(address) view returns (uint)",

  // Send some of your tokens to someone else
  "function transfer(address to, uint amount)",

  // An event triggered whenever anyone transfers to someone else
  "event Transfer(address indexed from, address indexed to, uint amount)",
];

const stETHContract = new ethers.Contract(stETHAddress, stEthAbi, signer);
(await stETHContract.connect(signer)).transfer(yourWalletAddress, ethers.utils.parseEther(stETHAmount));