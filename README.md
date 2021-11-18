# Sturdy 
Sturdy is a DeFi lending protocol. Sturdy enables 'suppliers' to earn yield on their stablecoins and 'borrowers' to take out interest-free stablecoin loans against their collateral. This interest-free mechanic is made possible through rehypothecation: when a borrower deposits their collateral (e.g. ETH), it is staked (e.g. turned into stETH via Lido). Over time, this stETH will naturally accumulate yield via Lido's rebasing mechanics; we harvest this yield and distribute it to stablecoin suppliers.


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

- Next run the following task to deploy all smart contracts
```
yarn sturdy:evm:fork:mainnet:migration
```

- For test, run the following task to have a test of sample contract on the localhost.
```
yarn test
```
