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
# StructureVault

## User Action

### Deposit

Deposits an `_amount` of underlying asset (USDC/USDT/DAI/WETH...).

- @param `_from` The depositor address
- @param `_amount` The deposit amount
  ```
  function deposit(address _from, uint256 _amount) external;
  ```

### Withdraw

Withdraws an `_amount` of underlying asset.
If vault has not enough, then perform the exit position including `exitSupply` or `deleverage and migration` to underlying asset (USDC/USDT/DAI/WETH...).

- @param `_to` The address that will receive the underlying asset, same as msg.sender if the user
               wants to receive it on his own wallet, or a different address if the beneficiary is a
               different wallet
- @param `_amount` The withdrawal amount
- @param `_params` The params to perform the exit position
  ```
  function withdraw(
    address _to,
    uint256 _amount,
    IStructuredVault.AutoExitPositionParams calldata _params
  ) external;
  ```
  The `AutoExitPositionParams` type includes the parameters to perform the exit position and migration
  
  if `AutoExitPositionParams.swapper` is zero address, it means `exitSupply`, otherwise it means `deleverage and migration`.
  ```
  struct AutoExitPositionParams {
    address swapper;
    address borrowAsset;
    address sAsset;
    IGeneralLevSwap2.FlashLoanType flashLoanType;
    IGeneralLevSwap2.SwapInfo swapInfo;
    IGeneralLevSwap2.MultipSwapPath[] paths;
  }
  ```

## Admin Action

### Supply

Lend an `_amount` of underlying asset to lendingPool.

- @param `_sAsset` The depositor address
- @param `_amount` The deposit amount
- @param `referralCode` Code used to register the integrator originating the operation, for potential rewards.
                        0 if the action is executed directly by the user, without any middle-man
  ```
  function supply(
    address _sAsset,
    uint256 _amount,
    uint16 referralCode
  ) external;
  ```

### ExitSupply

remove the `_amount` of underlying asset from lending pool.

- @param `_sAsset` staked asset address of underlying asset
- @param `_amount` The amount of underlying asset
  ```
  function exitSupply(address _sAsset, uint256 _amount) external;
  ```

### EnterPosition

Leverage an `_amount` of collateral asset via `_swapper`.

- @param `_swapper` The leverage/deleverage contract address
- @param `_amount` The amount of collateral
- @param `_leverage` Extra leverage value and must be greater than 0(ex. 300% = 300_00).
                    _amount + _amount * _leverage should be used as collateral
- @param `_borrowAsset` The borrowing asset address when leverage works
- @param `_flashLoanType` 0 is Aave, 1 is Balancer
- @param `_zapPaths` The uniswap/balancer/curve swap paths between underlying asset and collateral
- @param `_zapPathLength` The uniswap/balancer/curve swap path length between underlying asset and collateral.
                            if this value is 0, it means normal leverage if not, it means zapLeverage
- @param `_swapInfo` The uniswap/balancer/curve swap paths between borrowAsset and collateral.
  ```
  function enterPosition(
    address _swapper,
    uint256 _amount,
    uint256 _leverage,
    address _borrowAsset,
    IGeneralLevSwap2.FlashLoanType _flashLoanType,
    IGeneralLevSwap2.MultipSwapPath[3] calldata _zapPaths,
    uint256 _zapPathLength,
    IGeneralLevSwap2.SwapInfo calldata _swapInfo
  ) external;
  ```

### ExitPosition

Deleverage an `_requiredAmount` of collateral asset via `_swapper`.

- @param `_swapper` The leverage/deleverage contract address
- @param `_repayAmount` The amount of repay
- @param `_requiredAmount` The amount of collateral
- @param `_borrowAsset` The borrowing asset address when leverage works
- @param `_sAsset` staked asset address of collateral internal asset
- @param `_flashLoanType` 0 is Aave, 1 is Balancer
- @param `_swapInfo` The uniswap/balancer/curve swap infos between borrowAsset and collateral
  ```
  function exitPosition(
    address _swapper,
    uint256 _repayAmount,
    uint256 _requiredAmount,
    address _borrowAsset,
    address _sAsset,
    IGeneralLevSwap2.FlashLoanType _flashLoanType,
    IGeneralLevSwap2.SwapInfo calldata _swapInfo
  ) external;
  ```

### Migration

Migration between collateral assets or underlying asset.

- @param `_amount` The migration amount of `from` collateral address.
- @param `_paths` The uniswap/balancer/curve swap paths between from asset and to asset
  ```
  function migration(
    uint256 _amount,
    IGeneralLevSwap2.MultipSwapPath[] calldata _paths
  ) external;
  ```

### ProcessYield

Claim Yield and migration to underlying asset and distribute to users by increasing shareIndex.

- @param `_assets` The registered assets to variable yield distributor.
                     Normally these are the staked asset addresss of collateral internal assets
- @param `_amounts` The claiming amounts
- @param `_params` The params to perform the migration between yield asset and underlying asset
  ```
  function processYield(
    address[] calldata _assets,
    uint256[] calldata _amounts,
    IStructuredVault.YieldMigrationParams[] calldata _params
  ) external;
  ```

### ProcessLendingYield

Claim Lending Yield of underlying asset from lending pool.

  ```
  function processLendingYield() external;
  ```