# Sturdy 
Sturdy is a DeFi lending protocol. Sturdy enables 'suppliers' to earn yield on their stablecoins and 'borrowers' to take out self-repaying stablecoin loans against their collateral. This self-repaying mechanic is made possible through rehypothecation: when a borrower deposits their collateral (e.g. ETH), it is staked (e.g. turned into stETH via Lido). Over time, this stETH will naturally accumulate yield via Lido's rebasing mechanics; we harvest this yield and distribute it between suppliers and borrowers.

Our current launch plan is to support USDC for loans and ETH + WBTC for collateral. The staking strategy will be Lido for ETH and Yearn for WBTC. Additionally, we will have a separate pool that supports USDC loans and OHM as collateral; 'separate' means that the USDC reserve for these loans will not be the same one that supplies loans backed by ETH and WBTC. The rationale here is to have one pool that is low risk with well-established assets / strategies and one that is high risk but has a higher APY.

TO DO:
- Build mechanism to distribute yield to suppliers
- Build mechanism to distribute yield to borrowers
- Integrate ChainLink stETH oracle 
- Ensure ETH-stETH vault functions correctly end-to-end
- Create WBTC vault
- Create OHM vault


## Dev Environment
- EnvironmentFile (.env)
```
ALCHEMY_KEY="xxx"
```

- Compile
```
npm run compile
```

- Run the hardhat node on localhost.
```
FORK=main yarn hardhat node
```

- Compile
```
FORK=main yarn hardhat compile
```

- Next run the following task to deploy all smart contracts including sample contract "LendingPool"
```
yarn aave:evm:dev:fork:mainnet:migration
```

- For test, run the following task to have a test of sample contract on the localhost.
```
yarn test_sturdy:fork:mainnet
```
