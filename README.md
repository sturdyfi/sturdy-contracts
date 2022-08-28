# Sturdy 
Sturdy is a DeFi lending protocol. Sturdy enables 'suppliers' to earn yield on their stablecoins and 'borrowers' to take out interest-free stablecoin loans against their collateral. This interest-free mechanic is made possible through rehypothecation: when a borrower deposits their collateral (e.g. ETH), it is staked (e.g. turned into stETH via Lido). Over time, this stETH will grow in quantity over time because of its rebasing mechanic; we harvest this yield, convert it to stablecoins, and distribute it to stablecoin suppliers.

## Dev Environment
- Configure environment file (.env)
```
ALCHEMY_KEY="xxx"
```

- Install
```
yarn install
```

- Compile
```
yarn compile
```

- Run the hardhat node on localhost.
```
FORK=main yarn hardhat node
```

- Next run the following task to deploy all smart contracts
```
yarn sturdy:evm:fork:mainnet:migration
```

- For test, run the following task 
```
yarn audit:test
```
