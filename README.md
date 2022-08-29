# Dev Environment
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
